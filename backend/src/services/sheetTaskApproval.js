import mongoose from "mongoose";
import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { TaskEvent } from "../models/TaskEvent.js";
import { notifyMany } from "./notificationService.js";
import { logActivity } from "./activityService.js";
import { isCeo } from "../constants/roles.js";
import { isRecurring, computeNextDueDate } from "../utils/recurrence.js";
import { queueTaskAssignedWhatsApp } from "./whatsappTaskAssignment.js";
import { recordTaskSubmission, finalizeApprovalRecord } from "./taskApprovalHistory.js";

export const SUPERVISOR_SHEET_TASK_TITLE_REGEX = /fill\s+daily\s+supervisor\s+sheet/i;
export const COORDINATOR_SHEET_TASK_TITLE_REGEX = /fill\s+daily\s+coordinator\s+sheet/i;

export const TAG_DAILY_SUPERVISOR_SHEET = "daily_sheet_supervisor";
export const TAG_DAILY_COORDINATOR_SHEET = "daily_sheet_coordinator";

export const OPEN_SHEET_TASK_STATUSES = ["pending", "in_progress", "overdue", "awaiting_approval"];

export function isDailySheetTaskTitle(title) {
  const t = String(title || "");
  return SUPERVISOR_SHEET_TASK_TITLE_REGEX.test(t) || COORDINATOR_SHEET_TASK_TITLE_REGEX.test(t);
}

/** Detect supervisor/coordinator daily sheet tasks by title, tag, or functionTag. */
export function isDailySheetTask(task) {
  if (!task) return false;
  if (isDailySheetTaskTitle(task.title)) return true;
  const tags = Array.isArray(task.tags) ? task.tags : [];
  if (tags.includes(TAG_DAILY_SUPERVISOR_SHEET) || tags.includes(TAG_DAILY_COORDINATOR_SHEET)) return true;
  const ft = String(task.functionTag || "");
  return ft === "daily_supervisor_sheet" || ft === "daily_coordinator_sheet";
}

export function sheetTaskTitleRegexForTitle(title) {
  const t = String(title || "");
  if (SUPERVISOR_SHEET_TASK_TITLE_REGEX.test(t)) return SUPERVISOR_SHEET_TASK_TITLE_REGEX;
  if (COORDINATOR_SHEET_TASK_TITLE_REGEX.test(t)) return COORDINATOR_SHEET_TASK_TITLE_REGEX;
  return null;
}

function dateKeyAsiaKolkata(d) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
}

/**
 * One open daily-sheet task per assignee. Soft-deletes extras so the person is not
 * assigned "Fill Daily … Sheet" twice in Pending Recurring / WhatsApp / For Approval.
 */
export async function findOpenDailySheetTasksForAssignee(assigneeId, titleRegex) {
  let assigneeOid;
  try {
    assigneeOid = new mongoose.Types.ObjectId(String(assigneeId));
  } catch {
    return [];
  }
  return Task.find({
    deletedAt: null,
    assignees: assigneeOid,
    title: titleRegex,
    status: { $in: OPEN_SHEET_TASK_STATUSES },
  }).sort({ dueDate: -1, updatedAt: -1 });
}

/** Returns keepTask if any, and soft-deletes remaining open duplicates. */
export async function collapseOpenDailySheetDuplicates(tasks, { preferDayKey = "" } = {}) {
  if (!tasks?.length) return null;
  if (tasks.length === 1) return tasks[0];

  const scored = [...tasks].sort((a, b) => {
    const aMatch = preferDayKey && dateKeyAsiaKolkata(a.dueDate) === preferDayKey ? 1 : 0;
    const bMatch = preferDayKey && dateKeyAsiaKolkata(b.dueDate) === preferDayKey ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    // Prefer awaiting_approval so we don't re-queue the wrong copy.
    const aAwait = a.status === "awaiting_approval" ? 1 : 0;
    const bAwait = b.status === "awaiting_approval" ? 1 : 0;
    if (aAwait !== bAwait) return bAwait - aAwait;
    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  });

  const keep = scored[0];
  const dropIds = scored.slice(1).map((t) => t._id).filter(Boolean);
  if (dropIds.length) {
    await Task.updateMany(
      { _id: { $in: dropIds }, deletedAt: null },
      { $set: { deletedAt: new Date() } }
    );
  }
  return keep;
}

/** Open sheet task for assignee if one already exists (dedupe before assign/create). */
export async function findExistingOpenDailySheetTask(assigneeId, titleOrRegex) {
  const regex =
    titleOrRegex instanceof RegExp ? titleOrRegex : sheetTaskTitleRegexForTitle(titleOrRegex);
  if (!regex) return null;
  const open = await findOpenDailySheetTasksForAssignee(assigneeId, regex);
  return collapseOpenDailySheetDuplicates(open);
}

async function resolveSheetApprover({ kind, assigneeUser }) {
  if (!assigneeUser?.centerId) return null;

  if (kind === "coordinator") {
    // Coordinator sheets must be approved by a center head in the same center.
    return User.findOne({
      role: "centre_head",
      active: true,
      centerId: assigneeUser.centerId,
    })
      .select("_id")
      .lean();
  }

  // Supervisor sheets must be approved by coordinator of same department and center.
  if (assigneeUser.departmentPrimary) {
    const byDept = await User.findOne({
      role: "coordinator",
      active: true,
      centerId: assigneeUser.centerId,
      departmentPrimary: assigneeUser.departmentPrimary,
    })
      .select("_id")
      .lean();
    if (byDept?._id) return byDept;
  }

  // Legacy compatibility: some users still map departments via `department` string.
  const departmentText = String(assigneeUser.department || "").trim();
  if (departmentText) {
    const byLegacyDepartment = await User.findOne({
      role: "coordinator",
      active: true,
      centerId: assigneeUser.centerId,
      department: departmentText,
    })
      .select("_id")
      .lean();
    if (byLegacyDepartment?._id) return byLegacyDepartment;
  }

  // Fallback: supervisor's direct manager if it is a coordinator in same center.
  if (assigneeUser.reportsTo) {
    const direct = await User.findOne({
      _id: assigneeUser.reportsTo,
      role: "coordinator",
      active: true,
      centerId: assigneeUser.centerId,
    })
      .select("_id")
      .lean();
    if (direct?._id) return direct;
  }

  // If there is exactly one active coordinator in this center, route to that coordinator.
  const centerCoordinators = await User.find({
    role: "coordinator",
    active: true,
    centerId: assigneeUser.centerId,
  })
    .select("_id")
    .limit(2)
    .lean();
  if (centerCoordinators.length === 1 && centerCoordinators[0]?._id) return centerCoordinators[0];

  return null;
}

function dueDateFromSheetDate(sheetDate) {
  // Keep day matching stable in Asia/Kolkata checks.
  return new Date(`${sheetDate}T12:00:00.000+05:30`);
}

async function createDailySheetTask({ kind, assigneeUser, approverId, sheetDate }) {
  const isSupervisor = kind === "supervisor";
  const title = isSupervisor ? "Fill Daily Supervisor Sheet" : "Fill Daily Coordinator Sheet";
  const titleRegex = isSupervisor ? SUPERVISOR_SHEET_TASK_TITLE_REGEX : COORDINATOR_SHEET_TASK_TITLE_REGEX;
  const tag = isSupervisor ? TAG_DAILY_SUPERVISOR_SHEET : TAG_DAILY_COORDINATOR_SHEET;
  const functionTag = isSupervisor ? "daily_supervisor_sheet" : "daily_coordinator_sheet";
  const description = isSupervisor
    ? "Complete and submit the daily supervisor sheet."
    : "Complete and submit the daily coordinator sheet.";

  const existing = await findExistingOpenDailySheetTask(assigneeUser._id, titleRegex);
  if (existing) {
    const day = dateKeyAsiaKolkata(existing.dueDate);
    if (day !== sheetDate && existing.taskType === "daily" && existing.status !== "awaiting_approval") {
      existing.dueDate = dueDateFromSheetDate(sheetDate);
      if (!Array.isArray(existing.tags) || !existing.tags.includes(tag)) {
        existing.tags = [...new Set([...(existing.tags || []), tag, "recurring"])];
      }
      await existing.save();
    }
    return existing;
  }

  const task = await Task.create({
    title,
    description,
    taskType: "daily",
    status: "pending",
    priority: "high",
    dueDate: dueDateFromSheetDate(sheetDate),
    departmentId: assigneeUser?.departmentPrimary || null,
    centerId: assigneeUser?.centerId || null,
    functionTag,
    recurrence: { forever: true, includeSunday: false, weekOff: "Sunday" },
    assignees: [assigneeUser._id],
    assignedBy: approverId,
    createdBy: approverId,
    requiresApproval: true,
    approvalStatus: "none",
    tags: [tag, "recurring"],
  });
  queueTaskAssignedWhatsApp({
    taskId: task._id,
    assigneeIds: [assigneeUser._id],
    assignedByUserId: approverId,
  });
  return task;
}

async function advanceIfRecurring(task, actorId, actorName) {
  if (!isRecurring(task.taskType)) return false;
  const next = computeNextDueDate(task);
  if (!next) return false;

  await logActivity({
    actor: actorId,
    actorName,
    type: "task_occurrence_completed",
    message: `${actorName || "Someone"} completed occurrence of ${task.title}`,
    task: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    meta: { completedFor: task.dueDate, via: "daily_sheet" },
  });

  task.dueDate = next;
  task.status = "pending";
  task.completedAt = null;
  if (task.requiresApproval) task.approvalStatus = "none";
  await task.save();
  return true;
}

/**
 * When a daily sheet is saved, align with task completion flow: non-CEO submitters send the
 * matching daily task to For Approval; CEO submitters mark it completed (and roll recurring).
 */
export async function submitDailySheetTaskForApproval({
  assigneeId,
  centerId,
  sheetDate,
  kind,
  actorUserId,
  actorRole,
}) {
  const titleRegex = kind === "supervisor" ? SUPERVISOR_SHEET_TASK_TITLE_REGEX : COORDINATOR_SHEET_TASK_TITLE_REGEX;
  const tag = kind === "supervisor" ? TAG_DAILY_SUPERVISOR_SHEET : TAG_DAILY_COORDINATOR_SHEET;

  let assigneeOid;
  try {
    assigneeOid = new mongoose.Types.ObjectId(String(assigneeId));
  } catch {
    return { ok: false, reason: "invalid_assignee" };
  }

  const [actor, assigneeUser] = await Promise.all([
    User.findById(actorUserId).select("name").lean(),
    User.findById(assigneeId).select("_id centerId departmentPrimary department reportsTo").lean(),
  ]);
  if (!assigneeUser?._id) {
    return { ok: false, reason: "invalid_assignee" };
  }

  const approver = await resolveSheetApprover({ kind, assigneeUser });
  if (!approver?._id && !isCeo(actorRole)) {
    return { ok: false, reason: "no_approver_found" };
  }

  // Match by assignee + title only (no center filter) so a re-assigned / auto-created
  // sheet task never sits side-by-side with the existing one and shows up twice.
  const openList = await findOpenDailySheetTasksForAssignee(assigneeOid, titleRegex);
  let task = await collapseOpenDailySheetDuplicates(openList, { preferDayKey: sheetDate });

  if (!task && !isCeo(actorRole)) {
    // Final guard: race-safe re-check before insert.
    const race = await findOpenDailySheetTasksForAssignee(assigneeOid, titleRegex);
    task = await collapseOpenDailySheetDuplicates(race, { preferDayKey: sheetDate });
    if (!task) {
      task = await createDailySheetTask({
        kind,
        assigneeUser,
        approverId: approver._id,
        sheetDate,
      });
    }
  }
  if (!task) return { ok: false, reason: "no_matching_task" };

  let taskDay = dateKeyAsiaKolkata(task.dueDate);
  // Daily forever sheet: snap due date to the sheet day when still open (avoids a 2nd task).
  if (taskDay !== sheetDate && task.taskType === "daily" && task.status !== "awaiting_approval") {
    task.dueDate = dueDateFromSheetDate(sheetDate);
    if (!Array.isArray(task.tags) || !task.tags.includes(tag)) {
      task.tags = [...new Set([...(task.tags || []), tag, "recurring"])];
    }
    await task.save();
    taskDay = sheetDate;
  }
  if (taskDay !== sheetDate) {
    return { ok: false, reason: "due_date_mismatch", taskDay, sheetDate };
  }

  const prevStatus = task.status;

  // Keep approval ownership aligned to hierarchy even for already queued items.
  if (!isCeo(actorRole) && approver?._id) {
    const approverId = String(approver._id);
    if (String(task.createdBy || "") !== approverId) {
      task.createdBy = approverId;
      await task.save();
    }
  }

  if (task.status === "awaiting_approval" && task.approvalStatus === "pending") {
    return { ok: true, alreadyQueued: true };
  }

  if (isCeo(actorRole)) {
    task.status = "completed";
    task.approvalStatus = "approved";
    task.requiresApproval = false;
    task.completedAt = new Date();
    task.rejectionRemarks = "";
    task.rejectionMode = "";
    await task.save();
    await recordTaskSubmission({
      task,
      assigneeId: actorUserId,
      remarks: task.submissionRemarks || `${kind === "supervisor" ? "Supervisor" : "Coordinator"} sheet (CEO auto)`,
      kind: "completion",
      source: "assignee",
    });
    await TaskEvent.create({
      taskId: task._id,
      actorId: actorUserId,
      eventType: "approved",
      meta: { via: "daily_sheet_save", ceoAuto: true },
    });
    await finalizeApprovalRecord({
      task,
      occurrenceDueDate: task.dueDate,
      approverId: actorUserId,
      status: "approved",
    });
    return { ok: true, autoCompleted: true };
  }

  const approverId = approver?._id ? String(approver._id) : String(task.createdBy || "");
  if (approverId) task.createdBy = approverId;
  task.status = "awaiting_approval";
  task.approvalStatus = "pending";
  task.requiresApproval = true;
  task.completedAt = null;
  await task.save();

  if (prevStatus !== "awaiting_approval") {
    await recordTaskSubmission({
      task,
      assigneeId: actorUserId,
      remarks: task.submissionRemarks || `${kind === "supervisor" ? "Supervisor" : "Coordinator"} sheet submitted`,
      kind: "completion",
    });
  }

  await TaskEvent.create({
    taskId: task._id,
    actorId: actorUserId,
    eventType: "updated",
    meta: { status: task.status, via: "daily_sheet_save", prevStatus },
  });

  const shouldNotify = prevStatus !== "awaiting_approval" && task.createdBy;
  if (shouldNotify) {
    const label = kind === "supervisor" ? "Supervisor sheet" : "Coordinator sheet";
    await notifyMany([task.createdBy], {
      type: "task_approval_request",
      title: `${label} pending approval`,
      message: `${task.title} (${sheetDate}) was submitted — review in For Approval.`,
      link: "/for-approval",
    });
  }

  return { ok: true, queued: true };
}
