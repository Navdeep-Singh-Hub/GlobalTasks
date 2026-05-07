import mongoose from "mongoose";
import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { TaskEvent } from "../models/TaskEvent.js";
import { notifyMany } from "./notificationService.js";
import { logActivity } from "./activityService.js";
import { isCeo } from "../constants/roles.js";
import { isRecurring, computeNextDueDate } from "../utils/recurrence.js";

export const SUPERVISOR_SHEET_TASK_TITLE_REGEX = /fill\s+daily\s+supervisor\s+sheet/i;
export const COORDINATOR_SHEET_TASK_TITLE_REGEX = /fill\s+daily\s+coordinator\s+sheet/i;

export const TAG_DAILY_SUPERVISOR_SHEET = "daily_sheet_supervisor";
export const TAG_DAILY_COORDINATOR_SHEET = "daily_sheet_coordinator";

function dateKeyAsiaKolkata(d) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
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

  return null;
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

  const openStatuses = ["pending", "in_progress", "overdue", "awaiting_approval"];

  const baseFilter = {
    deletedAt: null,
    assignees: assigneeOid,
    title: titleRegex,
    status: { $in: openStatuses },
  };
  if (centerId) baseFilter.centerId = new mongoose.Types.ObjectId(String(centerId));

  let task = await Task.findOne({
    ...baseFilter,
    tags: tag,
  }).sort({ dueDate: -1 });

  if (!task) {
    task = await Task.findOne({ ...baseFilter }).sort({ dueDate: -1 });
  }

  if (!task) {
    return { ok: false, reason: "no_matching_task" };
  }

  const taskDay = dateKeyAsiaKolkata(task.dueDate);
  if (taskDay !== sheetDate) {
    return { ok: false, reason: "due_date_mismatch", taskDay, sheetDate };
  }

  const prevStatus = task.status;
  const [actor, assigneeUser] = await Promise.all([
    User.findById(actorUserId).select("name").lean(),
    User.findById(assigneeId).select("_id centerId departmentPrimary reportsTo").lean(),
  ]);

  const approver = await resolveSheetApprover({ kind, assigneeUser });
  if (!approver?._id && !isCeo(actorRole)) {
    return { ok: false, reason: "no_approver_found" };
  }

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
    await TaskEvent.create({
      taskId: task._id,
      actorId: actorUserId,
      eventType: "approved",
      meta: { via: "daily_sheet_save", ceoAuto: true },
    });
    await advanceIfRecurring(task, actorUserId, actor?.name);
    return { ok: true, autoCompleted: true };
  }

  const approverId = approver?._id ? String(approver._id) : String(task.createdBy || "");
  if (approverId) task.createdBy = approverId;
  task.status = "awaiting_approval";
  task.approvalStatus = "pending";
  task.requiresApproval = true;
  task.completedAt = null;
  await task.save();

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
