import { Router } from "express";
import { Task, TASK_TYPES, TASK_STATUSES, TASK_PRIORITIES } from "../models/Task.js";
import { User } from "../models/User.js";
import { authRequired, requireCenterAssigned, requireManagement, requireRoles } from "../middleware/auth.js";
import { isManagement, isCeo, isAssigneeOnly } from "../constants/roles.js";
import { notifyMany } from "../services/notificationService.js";
import { logActivity } from "../services/activityService.js";
import {
  RECURRING_TYPES as RECURRING,
  isRecurring,
  computeNextDueDate,
  calendarDayKeyInTz,
  APP_TIMEZONE,
  isOccurrencePastDue,
} from "../utils/recurrence.js";
import {
  applyTodayOnlyDueFilter,
  applyAssigneeRecurringWorkableFilter,
  isOccurrenceDueToday,
  isAssigneeRecurringWorkable,
  syncRecurringTasksForAssignee,
  syncRecurringTaskToToday,
} from "../services/recurringOccurrenceSync.js";
import { TaskApprovalRecord } from "../models/TaskApprovalRecord.js";
import { TaskEvent } from "../models/TaskEvent.js";
import { getAssignableAssigneeIds, findInvalidCenterAssignees, canAccessAnyCenter } from "../services/hierarchy.js";
import { isPastDataFillEmail } from "../services/pastDataFill.js";
import { canApproveTaskForUser } from "../services/taskApprovalRouting.js";
import {
  recordTaskSubmission,
  recordNotDoneSubmission,
  finalizeApprovalRecord,
  reopenApprovalForAssigner,
  resubmitDailyRecurringTask,
  filterAndEnrichApprovalInboxTasks,
  repairAndFilterApprovalInboxTasks,
  repairAssigneeInboxApprovalState,
  resolveOccurrenceDueForApproval,
  backfillApprovalRecordsFromEvents,
  assignerScopeClause,
  approvalVisibilityClause,
  approvalInboxTaskMatchClause,
  repairApprovalInboxPendingTaskState,
  claimSharedTaskForAssignee,
  filterAssigneePersonalOpenTasks,
  resolvePersonalWorkTaskView,
  repairAllSharedMultiAssigneeTasks,
  repairSharedMultiAssigneeForAssignee,
  looksLikeExplicitNotDoneReason,
} from "../services/taskApprovalHistory.js";
import { isWeekOffToday } from "../utils/weekoff.js";
import { assertAllowedDepartmentId } from "../utils/departments.js";
import { formatAppDate } from "../utils/dateFormat.js";
import { queueTaskAssignedWhatsApp } from "../services/whatsappTaskAssignment.js";
import {
  isDailySheetTaskTitle,
  findExistingOpenDailySheetTask,
  SUPERVISOR_SHEET_TASK_TITLE_REGEX,
  COORDINATOR_SHEET_TASK_TITLE_REGEX,
  TAG_DAILY_SUPERVISOR_SHEET,
  TAG_DAILY_COORDINATOR_SHEET,
} from "../services/sheetTaskApproval.js";
import {
  invalidateAssigneeSync,
  scheduleBackground,
  throttleKey,
  REPAIR_TTL_MS,
} from "../services/syncThrottle.js";

const router = Router();
router.use(authRequired);
router.use(requireCenterAssigned);

/** List views: skip heavy embedded form schema. */
const TASK_LIST_SELECT = "-requiredInputsSchema -inputPayload -__v";

async function actor(req) {
  if (req._actor) return req._actor;
  req._actor = await User.findById(req.userId).select("_id role centerId email").lean();
  return req._actor;
}

function actorHasAnyCenterAccess(req, me) {
  return canAccessAnyCenter({ role: req.userRole, email: me?.email }) || isPastDataFillEmail(me?.email);
}

function actorCanFillPastData(me) {
  return isPastDataFillEmail(me?.email);
}

const ADMIN_TASK_FIELDS = new Set([
  "title",
  "description",
  "taskType",
  "priority",
  "dueDate",
  "recurrence",
  "requiresApproval",
  "attachments",
  "voiceNoteUrl",
  "tags",
  "project",
  "departmentId",
  "centerId",
  "functionTag",
  "requiredInputsSchema",
  "inputPayload",
]);

function taskAssignerId(task) {
  return String(task?.assignedBy?._id || task?.assignedBy || task?.createdBy?._id || task?.createdBy || "");
}

function taskCreatedByUser(task, userId) {
  return taskAssignerId(task) === String(userId || "");
}

function managementCreatorOwnsTask(req, task) {
  return isManagement(req.userRole) && taskCreatedByUser(task, req.userId);
}

function assertTaskPatchPermission(req, body, task = null) {
  const isAdminLike = req.userRole === "ceo" || req.userRole === "centre_head";
  const creatorCanEditMaster = task && managementCreatorOwnsTask(req, task);
  const canEditAdminFields = isAdminLike || creatorCanEditMaster;
  for (const k of Object.keys(body)) {
    if (ADMIN_TASK_FIELDS.has(k) && !canEditAdminFields) {
      return "Only admin roles can edit these task fields";
    }
    if (k === "assignees" && !isManagement(req.userRole)) {
      return "Insufficient permissions to reassign tasks";
    }
  }
  return null;
}

/**
 * If a recurring task has just been marked completed, roll it forward to the next
 * occurrence instead of leaving it stuck. Returns true if the task was advanced.
 */
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
    meta: { completedFor: task.dueDate },
  });

  task.dueDate = next;
  task.status = "pending";
  task.completedAt = null;
  task.submissionRemarks = "";
  if (task.requiresApproval) task.approvalStatus = "none";
  await task.save();
  return true;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match task title/description and assignee / assigner names or emails. */
async function applyTaskTextAndPersonSearch(filter, query, { userId, role, centerId, isCeoRole } = {}) {
  const search = String(query.search || "").trim();
  const approval = query.approval === "true";
  if (!search) {
    if (approval) {
      mergeClauseIntoFilter(
        filter,
        await approvalInboxTaskMatchClause({ userId, role, centerId, isCeoRole: isCeoRole ?? false })
      );
    }
    return;
  }

  const regex = new RegExp(escapeRegex(search), "i");
  const clauses = [{ title: regex }, { description: regex }];

  const matchingUsers = await User.find({
    $or: [{ name: regex }, { email: regex }],
  })
    .select("_id")
    .limit(40)
    .lean();
  const userIds = matchingUsers.map((u) => u._id);
  if (userIds.length) {
    clauses.push(
      { assignees: { $in: userIds } },
      { assignedBy: { $in: userIds } },
      { createdBy: { $in: userIds } }
    );
  }

  if (approval) {
    filter.$and = [
      { $or: clauses },
      await approvalInboxTaskMatchClause({ userId, role, centerId, isCeoRole: isCeoRole ?? false }),
    ];
  } else {
    filter.$or = clauses;
  }
}

function buildFilter(query, userId, role) {
  const {
    status,
    statusGroup,
    priority,
    assignee,
    taskType,
    recurring,
    myTasks,
    masterScope,
    departmentId,
    centerId,
    functionTag,
    workableToday,
    assigneeInbox,
  } = query;
  const isMasterScope = String(masterScope || "").toLowerCase() === "true";
  const trashOnly = query.trash === "only" || query.bin === "only";
  /** Default lists active tasks; trash/recycle lists soft-deleted only. */
  const filter = trashOnly ? { deletedAt: { $ne: null } } : { deletedAt: null };

  if (status && status !== "all") {
    filter.status = status;
  } else if (statusGroup === "open") {
    if (assigneeInbox === "true") {
      // Include awaiting_approval so multi-assignee shared rows can still reach personal open filter.
      filter.status = { $in: ["pending", "in_progress", "overdue", "awaiting_approval"] };
    } else {
      filter.status = { $in: ["pending", "in_progress", "awaiting_approval", "overdue"] };
    }
  } else if (!trashOnly && !isMasterScope) {
    filter.status = { $ne: "cancelled" };
  }
  if (priority && priority !== "all") filter.priority = priority;
  if (assignee && assignee !== "all") filter.assignees = assignee;
  if (departmentId && departmentId !== "all") filter.departmentId = departmentId;
  if (centerId && centerId !== "all") filter.centerId = centerId;
  if (functionTag && functionTag !== "all") filter.functionTag = functionTag;
  if (taskType && taskType !== "all") filter.taskType = taskType;
  if (recurring === "true") filter.taskType = { $in: RECURRING };
  if (recurring === "false") filter.taskType = "one_time";

  if (myTasks === "true") filter.assignees = userId;
  else if (isAssigneeOnly(role)) filter.assignees = userId;

  if (workableToday === "true" && recurring === "true") {
    if (assigneeInbox === "true") {
      applyAssigneeRecurringWorkableFilter(filter);
    } else {
      applyTodayOnlyDueFilter(filter);
    }
  }

  return filter;
}

function assertOccurrenceWorkableForAssignee(task) {
  if (!isRecurring(task.taskType)) {
    if (isOccurrencePastDue(task.dueDate)) {
      return "This task is past its due date and time.";
    }
    return null;
  }
  if (!isOccurrenceDueToday(task.dueDate)) {
    return "You can only work on today's occurrence. Past days are marked not done automatically.";
  }
  return null;
}

function withEffectiveTaskStatus(task, now = new Date()) {
  const doc = { ...task };
  if (
    doc.taskType !== "daily" &&
    ["pending", "in_progress", "awaiting_approval"].includes(doc.status) &&
    doc.dueDate &&
    isOccurrencePastDue(doc.dueDate, now)
  ) {
    doc.status = "overdue";
  }
  return doc;
}

/** For Approval inbox: match occurrence due date (pending record), not rolled task dueDate. */
function filterApprovalInboxByOccurrenceDue(tasks, approvalDueDate) {
  const raw = String(approvalDueDate || "").trim();
  if (!raw) return tasks;
  const key = calendarDayKeyInTz(new Date(`${raw}T12:00:00+05:30`));
  if (!key) return tasks;
  return tasks.filter((t) => {
    const due = t.pendingOccurrenceDueDate || t.notDoneApproval?.dueDate || t.dueDate;
    return due && calendarDayKeyInTz(due) === key;
  });
}

/** Assigner reopened or reset a task after approve / reject / complete. */
function applyAssignerLifecycleReset(task, prevStatus, body, isAssignerEdit) {
  if (!isAssignerEdit) return;

  if (body.sendBackForApproval === true) {
    task.status = "awaiting_approval";
    task.approvalStatus = "pending";
    task.requiresApproval = true;
    task.completedAt = null;
    task.rejectionRemarks = "";
    task.rejectionMode = "";
    task.notDoneApproval = undefined;
    const remarks = String(body.submissionRemarks || "Reopened by assigner for re-approval.").trim();
    task.submissionRemarks = remarks;
    return;
  }

  const nextStatus = "status" in body ? body.status : task.status;
  const reopenStatuses = ["pending", "in_progress", "overdue"];
  const wasClosed = ["completed", "cancelled", "awaiting_approval"].includes(prevStatus);
  if ("status" in body && nextStatus === "awaiting_approval" && wasClosed) {
    task.approvalStatus = "pending";
    task.requiresApproval = true;
    task.completedAt = null;
    task.rejectionRemarks = "";
    task.rejectionMode = "";
    task.notDoneApproval = undefined;
    if (!String(task.submissionRemarks || "").trim()) {
      task.submissionRemarks = String(
        body.submissionRemarks || "Reopened by assigner for re-approval."
      ).trim();
    }
    return;
  }
  if ("status" in body && reopenStatuses.includes(nextStatus) && wasClosed) {
    task.approvalStatus = "none";
    task.completedAt = null;
    task.rejectionRemarks = "";
    task.rejectionMode = "";
    if (!("submissionRemarks" in body)) task.submissionRemarks = "";
    task.notDoneApproval = undefined;
  }
  if ("approvalStatus" in body && isAssignerEdit) {
    task.approvalStatus = body.approvalStatus;
    if (body.approvalStatus === "none" || body.approvalStatus === "rejected") {
      if (!("status" in body) && task.status === "awaiting_approval") {
        task.status = "pending";
      }
      task.completedAt = null;
    }
  }
}

function mergeClauseIntoFilter(filter, clause) {
  if (filter.$and) {
    filter.$and.push(clause);
    return;
  }
  if (filter.$or) {
    filter.$and = [{ $or: filter.$or }, clause];
    delete filter.$or;
    return;
  }
  Object.assign(filter, clause);
}

/** Master Single / Recurring: only tasks the user created or is assigned to. */
function applyMasterScopeFilter(filter, userId, relation) {
  const clause =
    relation === "assigned"
      ? { assignees: userId }
      : {
          $or: [
            { assignedBy: userId },
            { assignedBy: null, createdBy: userId },
            { assignedBy: { $exists: false }, createdBy: userId },
          ],
        };
  mergeClauseIntoFilter(filter, clause);
}

function userIsAssigneeOnTask(task, userId) {
  const uid = String(userId || "");
  return (task.assignees || []).some((a) => String(a._id || a) === uid);
}

/** Field staff: only tasks assigned to them. */
function applyAssigneeScopeFilter(filter, userId) {
  mergeClauseIntoFilter(filter, { assignees: userId });
}

/** Management (non-CEO): only tasks they assigned — not other managers' tasks. */
function applyAssignerScopeFilter(filter, userId) {
  mergeClauseIntoFilter(filter, assignerScopeClause(userId));
}

/** Pending Single / Pending Recurring — show tasks assigned TO me (incl. supervisor, coordinator, ops). */
function isAssigneeInboxQuery(query) {
  if (query.myTasks === "true") return true;
  if (query.workableToday === "true" && query.recurring === "true") return true;
  if (
    query.recurring === "false" &&
    query.statusGroup === "open" &&
    String(query.masterScope || "").toLowerCase() !== "true" &&
    query.approval !== "true"
  ) {
    return true;
  }
  return false;
}

/**
 * Master Completed / Rejected filters: recurring tasks roll to pending after approval,
 * so match tasks that have approval-history rows as well as live terminal status.
 */
async function applyMasterHistoricalStatusFilter(filter, query) {
  const isMasterScope = String(query.masterScope || "").toLowerCase() === "true";
  const status = query.status;
  if (!isMasterScope || !status || status === "all") return;

  if (status !== "completed" && status !== "cancelled") return;

  const scopedFilter = { ...filter };
  delete scopedFilter.status;

  const scopedTaskIds = await Task.distinct("_id", scopedFilter);
  if (!scopedTaskIds.length) {
    filter._id = { $in: [] };
    delete filter.status;
    return;
  }

  if (status === "completed") {
    const [fromHistory, fromLive] = await Promise.all([
      TaskApprovalRecord.distinct("taskId", {
        taskId: { $in: scopedTaskIds },
        status: { $in: ["approved", "not_done_acknowledged"] },
      }),
      Task.distinct("_id", { _id: { $in: scopedTaskIds }, status: "completed" }),
    ]);
    const ids = [...new Set([...fromHistory, ...fromLive].map(String))];
    filter._id = { $in: ids };
    delete filter.status;
    return;
  }

  const [fromHistory, fromLive] = await Promise.all([
    TaskApprovalRecord.distinct("taskId", {
      taskId: { $in: scopedTaskIds },
      status: "rejected",
    }),
    Task.distinct("_id", { _id: { $in: scopedTaskIds }, status: "cancelled" }),
  ]);
  const ids = [...new Set([...fromHistory, ...fromLive].map(String))];
  filter._id = { $in: ids };
  delete filter.status;
}

async function enrichMasterTasksWithHistoryMeta(tasks, statusFilter) {
  if (!tasks.length || (statusFilter !== "completed" && statusFilter !== "cancelled")) {
    return tasks.map((t) => (t.toObject ? t.toObject() : t));
  }

  const ids = tasks.map((t) => t._id);
  const matchStatus =
    statusFilter === "completed"
      ? { $in: ["approved", "not_done_acknowledged"] }
      : "rejected";

  const rows = await TaskApprovalRecord.aggregate([
    { $match: { taskId: { $in: ids }, status: matchStatus } },
    { $sort: { approvedAt: -1, rejectedAt: -1, submittedAt: -1 } },
    {
      $group: {
        _id: "$taskId",
        lastClosedAt: { $first: { $ifNull: ["$approvedAt", "$rejectedAt"] } },
        lastOccurrenceDue: { $first: "$occurrenceDueDate" },
        historyCount: { $sum: 1 },
      },
    },
  ]);
  const map = new Map(rows.map((r) => [String(r._id), r]));

  return tasks.map((t) => {
    const doc = t.toObject ? t.toObject() : { ...t };
    const hist = map.get(String(t._id));
    if (!hist) return doc;
    doc.masterLastClosedAt = hist.lastClosedAt;
    doc.masterLastOccurrenceDue = hist.lastOccurrenceDue;
    doc.masterHistoryCount = hist.historyCount;
    if (statusFilter === "completed" && doc.status !== "completed") {
      doc.masterDisplayStatus = "approved";
    }
    if (statusFilter === "cancelled" && doc.status !== "cancelled") {
      doc.masterDisplayStatus = "rejected";
    }
    return doc;
  });
}

async function applyApprovalListScope(filter, { userId, role, centerId }) {
  if (isCeo(role)) return;
  const visibility = await approvalVisibilityClause({ userId, role, centerId, isCeoRole: false });
  if (visibility) mergeClauseIntoFilter(filter, visibility);
}

function applyListScopeForRole(filter, { userId, role, query }) {
  const masterScope = String(query.masterScope || "").toLowerCase() === "true";
  if (masterScope) {
    // CEO / admin@globaltasks.demo: Master Recurring & Master Single show every task in the workspace.
    if (!isCeo(role)) {
      const masterRelation =
        String(query.masterRelation || "").toLowerCase() === "assigned" ? "assigned" : "created";
      applyMasterScopeFilter(filter, userId, masterRelation);
    }
    return;
  }
  if (isCeo(role)) return;
  if (isAssigneeInboxQuery(query) || isAssigneeOnly(role)) {
    applyAssigneeScopeFilter(filter, userId);
    return;
  }
  if (isManagement(role)) {
    applyAssignerScopeFilter(filter, userId);
  }
}

function applyMutationScopeForRole(query, userId, role) {
  if (isCeo(role)) return;
  if (isAssigneeOnly(role)) {
    applyAssigneeScopeFilter(query, userId);
    return;
  }
  if (isManagement(role)) {
    applyAssignerScopeFilter(query, userId);
  }
}

async function userCanAccessTaskDoc(task, userId, role, centerId) {
  const uid = String(userId || "");
  if (isCeo(role)) return true;
  if (taskAssignerId(task) === uid) return true;
  if (userIsAssigneeOnTask(task, uid)) return true;
  return false;
}

function canApproveTask({ userId, userRole, task }) {
  if (!task) return false;
  if (taskAssignerId(task) === String(userId || "")) return true;
  // Safety fallback for top-level oversight.
  if (userRole === "ceo") return true;
  return false;
}

router.get("/meta", (_req, res) => {
  res.json({ types: TASK_TYPES, statuses: TASK_STATUSES, priorities: TASK_PRIORITIES });
});

/** One-time: repair assignedBy from TaskEvent creators (CEO only). */
router.post("/admin/backfill-assigned-by", requireRoles("ceo"), async (_req, res) => {
  const createdEvents = await TaskEvent.find({ eventType: "created" }).select("taskId actorId").lean();
  const actorByTask = new Map(createdEvents.map((e) => [String(e.taskId), String(e.actorId)]));
  const tasks = await Task.find({}).select("_id createdBy assignedBy").lean();
  let updated = 0;
  for (const t of tasks) {
    const assigner = actorByTask.get(String(t._id)) || String(t.createdBy || "");
    if (!assigner || String(t.assignedBy || "") === assigner) continue;
    await Task.updateOne({ _id: t._id }, { $set: { assignedBy: assigner } });
    updated += 1;
  }
  res.json({ ok: true, updated, total: tasks.length });
});

/** One-time: rebuild TaskApprovalRecord from TaskEvent submit/approve logs (CEO only). */
router.post("/admin/backfill-approval-history", requireRoles("ceo"), async (_req, res) => {
  const result = await backfillApprovalRecordsFromEvents();
  res.json({ ok: true, ...result });
});

/**
 * Restore multi-assignee tasks that disappeared after one person submitted.
 * Fans out shared tasks to solo copies and backfills not-done / keeps completed history.
 * CEO only (or pass assigneeId as query to heal one person — also management? keep CEO for full).
 */
router.post("/admin/repair-shared-assignees", requireRoles("ceo", "centre_head"), async (req, res) => {
  try {
    const assigneeId = String(req.query.assigneeId || req.body?.assigneeId || "").trim();
    const result = assigneeId
      ? await repairSharedMultiAssigneeForAssignee(assigneeId)
      : await repairAllSharedMultiAssigneeTasks();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ message: e.message || "Repair failed" });
  }
});

router.get("/my-missed-occurrences", async (req, res) => {
  const records = await TaskApprovalRecord.find({
    assigneeId: req.userId,
    status: "missed",
  })
    .sort({ occurrenceDueDate: -1 })
    .limit(100)
    .lean();
  res.json({ records });
});

router.get("/", async (req, res) => {
  const me = await actor(req);
  const forceSync = req.query.sync === "true";
  const needsRecurringSync =
    req.query.recurring === "true" && (req.query.workableToday === "true" || req.query.assigneeInbox === "true");

  // Never block task list on recurring catch-up — background keeps UI responsive.
  if (needsRecurringSync) {
    scheduleBackground(
      throttleKey("recurring-sync", req.userId),
      () => syncRecurringTasksForAssignee(req.userId),
      forceSync ? 0 : undefined
    );
  }

  if (req.query.assigneeInbox === "true") {
    scheduleBackground(
      throttleKey("inbox-repair", req.userId),
      () => repairAssigneeInboxApprovalState(req.userId),
      REPAIR_TTL_MS
    );
  }

  const filter = buildFilter(req.query, req.userId, req.userRole);
  const isApprovalInbox = req.query.approval === "true";
  if (isApprovalInbox) {
    // Align status offline; list uses approval records for live pending rows.
    scheduleBackground(
      throttleKey("approval-inbox-repair", req.userId),
      () =>
        repairApprovalInboxPendingTaskState({
          userId: req.userId,
          role: req.userRole,
          centerId: me?.centerId || null,
          isCeoRole: isCeo(req.userRole),
        }),
      forceSync ? 0 : REPAIR_TTL_MS
    );
  }
  await applyTaskTextAndPersonSearch(filter, req.query, {
    userId: req.userId,
    role: req.userRole,
    centerId: me?.centerId || null,
    isCeoRole: isCeo(req.userRole),
  });
  if (!actorHasAnyCenterAccess(req, me)) filter.centerId = me?.centerId || null;
  const trashOnly = req.query.trash === "only" || req.query.bin === "only";
  const onBehalfAssigneeId = String(req.query.onBehalfAssigneeId || "").trim();
  const fillPast = actorCanFillPastData(me);
  if (onBehalfAssigneeId && fillPast) {
    filter.assignees = onBehalfAssigneeId;
  } else if (req.query.approval === "true") {
    await applyApprovalListScope(filter, {
      userId: req.userId,
      role: req.userRole,
      centerId: me?.centerId || null,
    });
  } else if (trashOnly) {
    applyListScopeForRole(filter, { userId: req.userId, role: req.userRole, query: req.query });
  } else {
    applyListScopeForRole(filter, { userId: req.userId, role: req.userRole, query: req.query });
  }
  await applyMasterHistoricalStatusFilter(filter, req.query);

  // Daily supervisor/coordinator sheet is filled via the dedicated form on Pending Recurring —
  // hide those backend tasks from the personal recurring inbox so they are not listed twice.
  if (req.query.assigneeInbox === "true" && req.query.recurring === "true") {
    const hideSheetTasks = {
      $nor: [
        { title: SUPERVISOR_SHEET_TASK_TITLE_REGEX },
        { title: COORDINATOR_SHEET_TASK_TITLE_REGEX },
        { tags: TAG_DAILY_SUPERVISOR_SHEET },
        { tags: TAG_DAILY_COORDINATOR_SHEET },
        { functionTag: "daily_supervisor_sheet" },
        { functionTag: "daily_coordinator_sheet" },
      ],
    };
    if (filter.$and) filter.$and.push(hideSheetTasks);
    else Object.assign(filter, hideSheetTasks);
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 25);

  const isMasterList = String(req.query.masterScope || "").toLowerCase() === "true";
  const statusFilter = req.query.status && req.query.status !== "all" ? String(req.query.status) : "all";
  const assigneeRecurringInbox =
    req.query.assigneeInbox === "true" && req.query.recurring === "true" && req.query.workableToday !== "true";

  const listQuery = Task.find(filter)
    .select(TASK_LIST_SELECT)
    .populate("assignees", "name email avatarUrl role")
    .populate("assignedBy", "name email")
    .populate("createdBy", "name email")
    .populate("project", "name")
    .populate("departmentId", "name code")
    .populate("centerId", "name code")
    .sort(assigneeRecurringInbox ? { dueDate: 1 } : isMasterList ? { updatedAt: -1 } : { createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const [taskDocs, total] = await Promise.all([listQuery, Task.countDocuments(filter)]);

  let tasks =
    isMasterList && (statusFilter === "completed" || statusFilter === "cancelled")
      ? await enrichMasterTasksWithHistoryMeta(taskDocs, statusFilter)
      : taskDocs;

  if (req.query.workableToday === "true" && req.query.recurring === "true") {
    tasks = tasks.filter((t) =>
      req.query.assigneeInbox === "true"
        ? isAssigneeRecurringWorkable(t)
        : t.taskType === "daily"
          ? isOccurrenceDueToday(t.dueDate)
          : isOccurrenceDueToday(t.dueDate)
    );
  }

  if (isApprovalInbox) {
    if (forceSync || req.query.repair === "true") {
      tasks = await repairAndFilterApprovalInboxTasks(tasks);
    } else {
      tasks = await filterAndEnrichApprovalInboxTasks(tasks);
    }
    if (req.query.approvalDueDate) {
      tasks = filterApprovalInboxByOccurrenceDue(tasks, req.query.approvalDueDate);
    }
  }

  if (req.query.assigneeInbox === "true") {
    const todayKey = calendarDayKeyInTz(new Date());
    const overdueDailyTodayIds = [];
    const personalAssigneeId =
      onBehalfAssigneeId && fillPast ? onBehalfAssigneeId : req.userId;
    tasks = tasks.map((t) => {
      const doc = withEffectiveTaskStatus(t);
      if (
        doc.taskType === "daily" &&
        doc.status === "overdue" &&
        calendarDayKeyInTz(doc.dueDate) === todayKey
      ) {
        doc.status = "pending";
        overdueDailyTodayIds.push(doc._id);
      }
      if (["pending", "in_progress", "overdue"].includes(doc.status) && doc.approvalStatus !== "pending") {
        doc.submissionRemarks = "";
      }
      return doc;
    });
    if (overdueDailyTodayIds.length) {
      void Task.updateMany(
        { _id: { $in: overdueDailyTodayIds }, status: "overdue" },
        { $set: { status: "pending" } }
      );
    }
    tasks = await filterAssigneePersonalOpenTasks(tasks, personalAssigneeId);
  } else {
    tasks = tasks.map((t) => withEffectiveTaskStatus(t));
  }

  res.json({
    tasks,
    total:
      (req.query.workableToday === "true" && req.query.recurring === "true") ||
      isApprovalInbox ||
      req.query.assigneeInbox === "true"
        ? tasks.length
        : total,
    page,
    limit,
  });
});

router.get("/:id", async (req, res) => {
  const me = await actor(req);
  const onBehalfAssigneeId = String(req.query.onBehalfAssigneeId || "").trim();
  const fillPast = actorCanFillPastData(me);
  const viewAsAssigneeId = onBehalfAssigneeId && fillPast ? onBehalfAssigneeId : req.userId;

  let task = await Task.findById(req.params.id)
    .populate("assignees", "name email avatarUrl role")
    .populate("assignedBy", "name email")
    .populate("createdBy", "name email")
    .populate("project", "name")
    .populate("departmentId", "name code")
    .populate("centerId", "name code");

  if (task && !task.deletedAt && isRecurring(task.taskType) && userIsAssigneeOnTask(task, viewAsAssigneeId)) {
    // Sync without a full reload round-trip first; re-populate once only if writes happened.
    const beforeDue = task.dueDate?.getTime?.() || task.dueDate;
    await syncRecurringTaskToToday(task, { assigneeId: viewAsAssigneeId });
    const afterDue = task.dueDate?.getTime?.() || task.dueDate;
    if (beforeDue !== afterDue || task.isModified?.()) {
      task = await Task.findById(req.params.id)
        .populate("assignees", "name email avatarUrl role")
        .populate("assignedBy", "name email")
        .populate("createdBy", "name email")
        .populate("project", "name")
        .populate("departmentId", "name code")
        .populate("centerId", "name code");
    }
  }

  if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
  if (!actorHasAnyCenterAccess(req, me) && String(task.centerId?._id || task.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can access tasks from your center only" });
  }
  if (fillPast && onBehalfAssigneeId) {
    if (!userIsAssigneeOnTask(task, onBehalfAssigneeId)) {
      return res.status(403).json({ message: "Selected user is not an assignee on this task" });
    }
  } else if (!(await userCanAccessTaskDoc(task, req.userId, req.userRole, me?.centerId || null))) {
    return res.status(403).json({ message: "You can only access tasks assigned to you or tasks you assigned" });
  }

  const personal = await resolvePersonalWorkTaskView(task, viewAsAssigneeId);
  const base =
    personal && typeof personal === "object"
      ? personal
      : task.toObject
        ? task.toObject()
        : task;
  // Prefer populated relations from the populated fetch
  const populated = task.toObject ? task.toObject() : task;
  // Personal view (status / work state) must win over raw task fields so Submit stays visible.
  const merged = {
    ...populated,
    ...base,
    assignees: populated.assignees,
    assignedBy: populated.assignedBy,
    createdBy: populated.createdBy,
    project: populated.project,
    departmentId: populated.departmentId,
    centerId: populated.centerId,
    // Always re-assert personal fields after populates
    personalWorkState: base.personalWorkState || "open",
    personalPendingKind: base.personalPendingKind,
    canSubmitForApproval: base.canSubmitForApproval,
    unstuck: base.unstuck,
    sharedTaskAwaitingOthers: base.sharedTaskAwaitingOthers,
    status: base.status ?? populated.status,
    approvalStatus: base.approvalStatus ?? populated.approvalStatus,
    submissionRemarks: base.submissionRemarks ?? populated.submissionRemarks,
    notDoneApproval: base.notDoneApproval !== undefined ? base.notDoneApproval : populated.notDoneApproval,
  };
  res.json({ task: withEffectiveTaskStatus(merged) });
});

router.post("/", async (req, res, next) => {
  try {
    const me = await actor(req);
    const payload = { ...req.body };
    if (!payload.title || !payload.dueDate) return res.status(400).json({ message: "Title and due date required" });
    if (!payload.departmentId) return res.status(400).json({ message: "Department is required" });
    const deptOk = await assertAllowedDepartmentId(payload.departmentId);
    if (!deptOk.ok) return res.status(400).json({ message: deptOk.message });
    if (!payload.description || !String(payload.description).trim()) {
      return res.status(400).json({ message: "Description is required" });
    }
    if (!payload.centerId) return res.status(400).json({ message: "Center is required" });
    if (!actorHasAnyCenterAccess(req, me) && String(payload.centerId) !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can only create tasks in your center" });
    }
    if (!Array.isArray(payload.assignees)) payload.assignees = payload.assignees ? [payload.assignees] : [];
    const assignableIds = await getAssignableAssigneeIds({
      actorId: req.userId,
      actorRole: req.userRole,
      centerId: payload.centerId,
      actorEmail: me?.email,
    });
    if (payload.assignees.length) {
      if (assignableIds.length === 0) return res.status(403).json({ message: "You cannot assign tasks to users" });
      const invalidAssignee = payload.assignees.find((id) => !assignableIds.includes(String(id)));
      if (invalidAssignee) {
        return res.status(403).json({ message: "You can only assign tasks to your allowed hierarchy users" });
      }
    }
    if (payload.assignees.length) {
      const invalidCenter = await findInvalidCenterAssignees(payload.assignees, payload.centerId);
      if (invalidCenter.length > 0) {
        return res.status(400).json({ message: "All assignees must belong to the selected center" });
      }
    }
    if (!payload.requiredInputsSchema) payload.requiredInputsSchema = { type: "object", properties: {}, required: [] };
    if (!payload.inputPayload) payload.inputPayload = {};
    if (payload.requiresApproval) payload.approvalStatus = "none";
    payload.assignedBy = req.userId;
    payload.createdBy = req.userId;

    // One Task document per assignee so submit/approve/history never leak across people.
    const assigneeIds = [...new Set((payload.assignees || []).map((id) => String(id)).filter(Boolean))];
    const isSheetTitle = isDailySheetTaskTitle(payload.title);
    // Tag sheet tasks consistently so save/approval and inbox filters find them.
    if (isSheetTitle) {
      const isSup = SUPERVISOR_SHEET_TASK_TITLE_REGEX.test(String(payload.title || ""));
      const tag = isSup ? TAG_DAILY_SUPERVISOR_SHEET : TAG_DAILY_COORDINATOR_SHEET;
      const functionTag = isSup ? "daily_supervisor_sheet" : "daily_coordinator_sheet";
      payload.tags = [...new Set([...(Array.isArray(payload.tags) ? payload.tags : []), tag, "recurring"])];
      if (!payload.functionTag || payload.functionTag === "general") payload.functionTag = functionTag;
      if (!payload.taskType || payload.taskType === "one_time") payload.taskType = "daily";
      if (!payload.recurrence) payload.recurrence = { forever: true, includeSunday: false, weekOff: "Sunday" };
    }

    const createPayloads =
      assigneeIds.length > 1
        ? assigneeIds.map((id) => ({ ...payload, assignees: [id] }))
        : [{ ...payload, assignees: assigneeIds }];

    const createdTasks = [];
    const skippedDuplicateAssignees = [];
    for (const p of createPayloads) {
      const onlyAssignee = p.assignees?.[0] ? String(p.assignees[0]) : "";
      if (isSheetTitle && onlyAssignee) {
        // eslint-disable-next-line no-await-in-loop
        const already = await findExistingOpenDailySheetTask(onlyAssignee, payload.title);
        if (already) {
          skippedDuplicateAssignees.push(onlyAssignee);
          continue;
        }
      }
      // eslint-disable-next-line no-await-in-loop
      const task = await Task.create(p);
      createdTasks.push(task);
      // eslint-disable-next-line no-await-in-loop
      await TaskEvent.create({
        taskId: task._id,
        actorId: req.userId,
        eventType: "created",
        meta: { status: task.status, fanOut: assigneeIds.length > 1 },
      });
    }

    if (!createdTasks.length) {
      return res.status(409).json({
        message:
          skippedDuplicateAssignees.length > 1
            ? "Fill Daily sheet task is already assigned to each selected person (only one open assignment allowed)."
            : "Fill Daily sheet task is already assigned to this person (only one open assignment allowed).",
        skippedDuplicateAssignees,
      });
    }

    const task = createdTasks[0];
    const creator = await User.findById(req.userId).lean();
    const createdAssigneeIds = createdTasks.flatMap((t) => (t.assignees || []).map(String));
    if (createdAssigneeIds.length) {
      const notifyIds = createdAssigneeIds.filter((id) => id !== String(req.userId));
      if (notifyIds.length) {
        await notifyMany(notifyIds, {
          type: "task_assigned",
          title: "New task assigned",
          message: `${creator?.name || "Admin"} assigned: ${task.title}`,
          link: "/pending-single",
        });
      }
      for (const t of createdTasks) {
        const ids = (t.assignees || []).map(String).filter((id) => id !== String(req.userId));
        if (ids.length) {
          queueTaskAssignedWhatsApp({
            taskId: t._id,
            assigneeIds: ids,
            assignedByUserId: req.userId,
          });
        }
        for (const id of t.assignees || []) invalidateAssigneeSync(id);
      }
    }
    await logActivity({
      actor: req.userId,
      actorName: creator?.name,
      type: "task_assigned",
      message:
        createdAssigneeIds.length > 1
          ? `${creator?.name || "Admin"} assigned ${task.title} to ${createdAssigneeIds.length} people`
          : `${creator?.name || "Admin"} assigned ${task.title}`,
      task: task._id,
      taskTitle: task.title,
      taskType: task.taskType,
      meta: skippedDuplicateAssignees.length
        ? { skippedDuplicateSheetAssignees: skippedDuplicateAssignees }
        : undefined,
    });

    res.status(201).json({
      task,
      tasks: createdTasks,
      skippedDuplicateAssignees,
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const me = await actor(req);
    let task = await Task.findById(req.params.id);
    if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
    if (!actorHasAnyCenterAccess(req, me) && String(task.centerId || "") !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can edit tasks from your center only" });
    }
    const onBehalfAssigneeId = String(req.body.onBehalfAssigneeId || "").trim();
    const fillPast = actorCanFillPastData(me);
    if (onBehalfAssigneeId && fillPast && !userIsAssigneeOnTask(task, onBehalfAssigneeId)) {
      return res.status(403).json({ message: "Selected user is not an assignee on this task" });
    }
    const actingAsAssigneeId = onBehalfAssigneeId && fillPast ? onBehalfAssigneeId : null;
    const isAssignerEdit = managementCreatorOwnsTask(req, task) || (isCeo(req.userRole) && taskCreatedByUser(task, req.userId));
    if (
      !actingAsAssigneeId &&
      !isAssignerEdit &&
      !(await userCanAccessTaskDoc(task, req.userId, req.userRole, me?.centerId || null))
    ) {
      return res.status(403).json({ message: "You can only edit tasks assigned to you or that you created" });
    }

    const denied = assertTaskPatchPermission(req, req.body, task);
    if (denied) return res.status(403).json({ message: denied });

    const prevStatus = task.status;
    if (isAssignerEdit && req.body.sendBackForApproval === true) {
      const canSendBack =
        ["completed", "cancelled"].includes(prevStatus) ||
        task.approvalStatus === "approved" ||
        (prevStatus === "pending" && task.requiresApproval);
      if (!canSendBack) {
        return res.status(400).json({ message: "This task cannot be sent back for approval" });
      }
    }

    if ("departmentId" in req.body) {
      const deptOk = await assertAllowedDepartmentId(req.body.departmentId);
      if (!deptOk.ok) return res.status(400).json({ message: deptOk.message });
    }

    const prevAssigneeIds = (task.assignees || []).map((id) => String(id));
    const allowedFields = [
      "title",
      "description",
      "taskType",
      "priority",
      "dueDate",
      "recurrence",
      "assignees",
      "requiresApproval",
      "status",
      "approvalStatus",
      "submissionRemarks",
      "attachments",
      "voiceNoteUrl",
      "tags",
      "project",
      "departmentId",
      "centerId",
      "functionTag",
      "requiredInputsSchema",
      "inputPayload",
    ];
    for (const k of allowedFields) {
      if (k in req.body) {
        if (k === "project") {
          const p = req.body.project;
          task.project = p && String(p).trim() !== "" ? p : null;
        } else {
          task[k] = req.body[k];
        }
      }
    }
    if ("taskType" in req.body && req.body.taskType === "one_time") {
      task.recurrence = { forever: true, includeSunday: false, weekOff: "Sunday", endDate: null };
    }
    if ("centerId" in req.body && !actorHasAnyCenterAccess(req, me) && String(req.body.centerId || "") !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can only set your center on tasks" });
    }
    if ("assignees" in req.body) {
      const assignableIds = await getAssignableAssigneeIds({
        actorId: req.userId,
        actorRole: req.userRole,
        centerId: task.centerId,
        actorEmail: me?.email,
      });
      if (task.assignees?.length) {
        if (assignableIds.length === 0) return res.status(403).json({ message: "You cannot assign tasks to users" });
        const invalidAssignee = task.assignees.find((id) => !assignableIds.includes(String(id)));
        if (invalidAssignee) {
          return res.status(403).json({ message: "You can only assign tasks to your allowed hierarchy users" });
        }
      }
    }
    if (task.assignees?.length) {
      const invalidCenter = await findInvalidCenterAssignees(task.assignees, task.centerId);
      if (invalidCenter.length > 0) {
        return res.status(400).json({ message: "All assignees must belong to task center" });
      }
    }

    const requestedComplete = "status" in req.body && req.body.status === "completed";
    const submissionRemarks = String(req.body.submissionRemarks || "").trim();
    if (requestedComplete && (task.assignees || []).some((id) => String(id) === String(req.userId))) {
      const meUser = await User.findById(req.userId).select("_id weekOffDays").lean();
      if (isWeekOffToday(meUser?.weekOffDays || [])) {
        return res.status(400).json({ message: "You cannot mark tasks on your week off day." });
      }
    }
    const requiredFields = Array.isArray(task.requiredInputsSchema?.required) ? task.requiredInputsSchema.required : [];
    if (!task.inputPayload || typeof task.inputPayload !== "object") task.inputPayload = {};
    // Approval submit: remarks satisfy legacy required-input fields (drawer has no separate payload UI).
    if (requestedComplete && submissionRemarks && requiredFields.length) {
      for (const field of requiredFields) {
        const val = task.inputPayload[field];
        if (val === "" || val === null || val === undefined) {
          task.inputPayload[field] = submissionRemarks;
        }
      }
    }
    const payloadKeys = Object.keys(task.inputPayload);
    const filledRequired = requiredFields.filter(
      (k) => payloadKeys.includes(k) && task.inputPayload[k] !== "" && task.inputPayload[k] !== null
    ).length;
    task.inputCompletionPercent = requiredFields.length ? Math.round((filledRequired / requiredFields.length) * 100) : 100;
    if (requestedComplete && requiredFields.length && filledRequired < requiredFields.length) {
      const missing = requiredFields.filter(
        (k) => !payloadKeys.includes(k) || task.inputPayload[k] === "" || task.inputPayload[k] === null
      );
      return res.status(400).json({
        message:
          missing.length === 1
            ? `Required input missing: ${missing[0]}`
            : "Required inputs missing",
        errors: missing.map((field) => ({ field, issue: "required" })),
      });
    }
    if (requestedComplete && !isCeo(req.userRole)) {
      const submitAsId = actingAsAssigneeId || req.userId;
      if (!actingAsAssigneeId) {
        const workableErr = assertOccurrenceWorkableForAssignee(task);
        if (workableErr) return res.status(400).json({ message: workableErr });
      }
      if (!submissionRemarks) {
        return res.status(400).json({ message: "Remarks are required when submitting for approval" });
      }
      // Multi-assignee: split so this submit only affects this person's task; others keep open copies.
      if ((task.assignees || []).length > 1 && userIsAssigneeOnTask(task, submitAsId)) {
        const originalTask = task;
        const { workingTask, clones, removedSelfFromOriginal } = await claimSharedTaskForAssignee(
          originalTask,
          submitAsId,
          { actorId: req.userId }
        );
        for (const c of clones) {
          for (const id of c.assignees || []) invalidateAssigneeSync(id);
        }
        if (removedSelfFromOriginal) {
          await originalTask.save();
        }
        task = workingTask;
      }
      task.submissionRemarks = submissionRemarks;
      task.status = "awaiting_approval";
      task.approvalStatus = "pending";
      task.requiresApproval = true;
      task.completedAt = null;
      // Clear stale not-done state so assigner Approve treats this as a real completion submit.
      task.notDoneApproval = undefined;
      if (task.taskType === "daily" && !isOccurrenceDueToday(task.dueDate) && !actingAsAssigneeId) {
        const todayKey = calendarDayKeyInTz(new Date());
        const time = new Intl.DateTimeFormat("en-GB", {
          timeZone: APP_TIMEZONE,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date(task.dueDate));
        task.dueDate = new Date(`${todayKey}T${time}+05:30`);
      }
    } else if (task.status === "in_progress" || task.status === "pending") {
      if ("submissionRemarks" in req.body) task.submissionRemarks = "";
    } else if (task.status === "completed" && !task.completedAt) {
      task.completedAt = new Date();
    }

    applyAssignerLifecycleReset(task, prevStatus, req.body, isAssignerEdit);

    const assigneeList = (task.assignees || []).map((id) => String(id));
    const lastClosed = await TaskApprovalRecord.findOne({
      taskId: task._id,
      status: { $in: ["approved", "not_done_acknowledged", "rejected"] },
    })
      .sort({ approvedAt: -1, rejectedAt: -1, submittedAt: -1 })
      .select("assigneeId")
      .lean();
    const reopenAssigneeId =
      String(req.body.assigneeId || "").trim() ||
      (lastClosed?.assigneeId ? String(lastClosed.assigneeId) : "") ||
      (assigneeList.length === 1 ? assigneeList[0] : "") ||
      String(req.userId);
    const assignerReopened =
      isAssignerEdit &&
      String(taskAssignerId(task)) === String(req.userId) &&
      (req.body.sendBackForApproval === true ||
        (task.status === "awaiting_approval" &&
          ["completed", "cancelled"].includes(prevStatus)));
    let assignerReopenedHistory = false;
    if (assignerReopened) {
      const reopened = await reopenApprovalForAssigner({
        task,
        assigneeId: reopenAssigneeId,
        remarks: task.submissionRemarks,
        occurrenceDueDate: req.body.occurrenceDueDate,
      });
      if (reopened?.occurrenceDueDate) {
        task.dueDate = reopened.occurrenceDueDate;
      }
      assignerReopenedHistory = Boolean(reopened);
    }

    await task.save();
    await TaskEvent.create({
      taskId: task._id,
      actorId: req.userId,
      eventType: "updated",
      meta: { status: task.status },
    });

    const justCompleted = prevStatus !== "completed" && task.status === "completed";
    if (justCompleted && !task.requiresApproval) {
      const actor = await User.findById(req.userId).lean();
      await advanceIfRecurring(task, req.userId, actor?.name);
    }

    if (prevStatus !== "awaiting_approval" && task.status === "awaiting_approval") {
      if (!assignerReopenedHistory) {
        await recordTaskSubmission({
          task,
          assigneeId: assignerReopened
            ? reopenAssigneeId
            : actingAsAssigneeId || req.userId,
          remarks: task.submissionRemarks,
          kind: "completion",
        });
      }
      const note = String(task.submissionRemarks || "").trim();
      const snippet = note ? ` Remarks: ${note.slice(0, 240)}${note.length > 240 ? "…" : ""}` : "";
      if (assignerReopened) {
        if (task.assignees?.length) {
          await notifyMany(task.assignees, {
            type: "task_approval_request",
            title: "Task sent back for review",
            message: `Your assigner reopened "${task.title}" for re-approval.${snippet}`,
            link: isRecurring(task.taskType) ? "/pending-recurring" : "/pending-single",
          });
        }
      } else {
        const approverId = taskAssignerId(task);
        if (approverId) {
          await notifyMany([approverId], {
            type: "task_approval_request",
            title: "Completion pending approval",
            message: `An assignee submitted "${task.title}" for completion.${snippet}`,
            link: "/for-approval",
          });
        }
      }
    }

    if (prevStatus !== task.status && task.assignees?.length) {
      await notifyMany(task.assignees, {
        type: "task_status",
        title: "Task status updated",
        message: `${task.title} → ${task.status.replace("_", " ")}`,
        link: "/pending-single",
      });
    }

    if ("assignees" in req.body) {
      const newAssigneeIds = (task.assignees || []).map((id) => String(id));
      const addedAssignees = newAssigneeIds.filter((id) => !prevAssigneeIds.includes(id) && id !== String(req.userId));
      if (addedAssignees.length) {
        queueTaskAssignedWhatsApp({
          taskId: task._id,
          assigneeIds: addedAssignees,
          assignedByUserId: req.userId,
        });
      }
      for (const id of new Set([...newAssigneeIds, ...prevAssigneeIds])) invalidateAssigneeSync(id);
    }

    const justSubmitted =
      !assignerReopened && prevStatus !== "awaiting_approval" && task.status === "awaiting_approval";
    if (justSubmitted || assignerReopened || prevStatus !== task.status) {
      for (const id of task.assignees || []) invalidateAssigneeSync(id);
    }

    res.json({ task });
  } catch (e) {
    next(e);
  }
});

router.post("/bulk", async (req, res) => {
  const me = await actor(req);
  const { ids = [], action, status } = req.body;
  if (!ids.length) return res.json({ ok: true });
  const onBehalfAssigneeId = String(req.body.onBehalfAssigneeId || "").trim();
  const fillPast = actorCanFillPastData(me);
  const actingAsAssigneeId = onBehalfAssigneeId && fillPast ? onBehalfAssigneeId : null;
  const scope = !actorHasAnyCenterAccess(req, me) ? { centerId: me?.centerId || null } : {};
  if (!actingAsAssigneeId) {
    applyMutationScopeForRole(scope, req.userId, req.userRole);
  }

  if (action === "delete") {
    await Task.updateMany({ _id: { $in: ids }, ...scope }, { $set: { deletedAt: new Date() } });
    return res.json({ ok: true });
  }
  if (action === "hard_delete") {
    if (!isCeo(req.userRole)) return res.status(403).json({ message: "Only the CEO can permanently delete multiple tasks" });
    await Task.deleteMany({ _id: { $in: ids } });
    return res.json({ ok: true });
  }
  if (action === "restore") {
    await Task.updateMany({ _id: { $in: ids }, ...scope }, { $set: { deletedAt: null } });
    return res.json({ ok: true });
  }

  if (status === "completed") {
    if (isAssigneeOnly(req.userRole) && !actingAsAssigneeId) {
      const meUser = await User.findById(req.userId).select("_id weekOffDays").lean();
      if (isWeekOffToday(meUser?.weekOffDays || [])) {
        return res.status(400).json({ message: "You cannot mark tasks on your week off day." });
      }
    }
    const submissionRemarks = String(req.body.submissionRemarks || "").trim();
    if (!isCeo(req.userRole) && !submissionRemarks) {
      return res.status(400).json({ message: "Remarks are required when submitting for approval" });
    }
    if (!isCeo(req.userRole) && !actingAsAssigneeId) {
      const tasksToCheck = await Task.find({ _id: { $in: ids }, ...scope }).lean();
      const tooEarly = tasksToCheck.find((t) => assertOccurrenceWorkableForAssignee(t));
      if (tooEarly) {
        return res.status(400).json({ message: assertOccurrenceWorkableForAssignee(tooEarly) });
      }
    }
    const actor = await User.findById(req.userId).lean();
    const tasks = await Task.find({ _id: { $in: ids }, ...scope });
    for (const t of tasks) {
      if (actingAsAssigneeId && !userIsAssigneeOnTask(t, actingAsAssigneeId)) {
        continue;
      }
      if (!isCeo(req.userRole)) {
        let working = t;
        const submitAsId = actingAsAssigneeId || req.userId;
        if ((t.assignees || []).length > 1 && userIsAssigneeOnTask(t, submitAsId)) {
          // eslint-disable-next-line no-await-in-loop
          const { workingTask, clones, removedSelfFromOriginal } = await claimSharedTaskForAssignee(
            t,
            submitAsId,
            { actorId: req.userId }
          );
          for (const c of clones) {
            for (const id of c.assignees || []) invalidateAssigneeSync(id);
          }
          if (removedSelfFromOriginal) {
            // eslint-disable-next-line no-await-in-loop
            await t.save();
          }
          working = workingTask;
        }
        working.submissionRemarks = submissionRemarks;
        working.status = "awaiting_approval";
        working.approvalStatus = "pending";
        working.requiresApproval = true;
        working.completedAt = null;
        // eslint-disable-next-line no-await-in-loop
        await recordTaskSubmission({
          task: working,
          assigneeId: submitAsId,
          remarks: submissionRemarks,
          kind: "completion",
        });
        // eslint-disable-next-line no-await-in-loop
        await working.save();
      } else {
        t.status = "completed";
        if (!t.completedAt) t.completedAt = new Date();
        if (!t.requiresApproval) await advanceIfRecurring(t, req.userId, actor?.name);
        await t.save();
      }
    }
    if (!isCeo(req.userRole)) {
      const creatorCounts = new Map();
      for (const t of tasks) {
        const key = taskAssignerId(t);
        if (!key) continue;
        creatorCounts.set(key, (creatorCounts.get(key) || 0) + 1);
      }
      for (const [creatorId, count] of creatorCounts.entries()) {
        // eslint-disable-next-line no-await-in-loop
        await notifyMany([creatorId], {
          type: "task_approval_request",
          title: "Completions pending approval",
          message: `${count} task(s) were submitted for completion.`,
          link: "/for-approval",
        });
      }
    }
    return res.json({ ok: true });
  }

  if (status) {
    await Task.updateMany({ _id: { $in: ids }, ...scope }, { $set: { status } });
  }
  res.json({ ok: true });
});

router.post("/:id/resubmit", async (req, res) => {
  try {
    const me = await actor(req);
    const task = await Task.findById(req.params.id);
    if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
    if (!actorHasAnyCenterAccess(req, me) && String(task.centerId || "") !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can resubmit tasks from your center only" });
    }

    const isAssignee = userIsAssigneeOnTask(task, req.userId);
    const isAssigner = await canApproveTaskForUser({ userId: req.userId, userRole: req.userRole, task });
    if (!isAssignee && !isAssigner) {
      return res.status(403).json({ message: "Only the assignee or assigner can resubmit this task" });
    }

    const result = await resubmitDailyRecurringTask({ task });
    if (!result.ok) return res.status(400).json({ message: result.message });

    const actorUser = await User.findById(req.userId).lean();
    await TaskEvent.create({
      taskId: task._id,
      actorId: req.userId,
      eventType: "updated",
      meta: {
        action: "resubmitted",
        occurrenceDueDate: result.occurrenceDueDate,
        by: isAssigner ? "assigner" : "assignee",
      },
    });

    if (isAssigner && task.assignees?.length) {
      await notifyMany(task.assignees, {
        type: "task_assigned",
        title: "Please resubmit today's task",
        message: `${actorUser?.name || "Your assigner"} asked you to redo and submit "${task.title}" again for today.`,
        link: "/pending-recurring",
      });
    } else if (isAssignee) {
      const approverId = taskAssignerId(task);
      if (approverId) {
        await notifyMany([approverId], {
          type: "task_updated",
          title: "Submission withdrawn",
          message: `${actorUser?.name || "Assignee"} withdrew "${task.title}" to redo today's occurrence.`,
          link: "/for-approval",
        });
      }
    }

    const refreshed = await Task.findById(task._id)
      .populate("assignees", "name email avatarUrl role")
      .populate("assignedBy", "name email")
      .populate("createdBy", "name email");
    res.json({ task: refreshed });
  } catch (e) {
    res.status(500).json({ message: e.message || "Could not resubmit task" });
  }
});

router.post("/:id/not-done", async (req, res) => {
  try {
    const me = await actor(req);
    let task = await Task.findById(req.params.id);
    if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
    if (!actorHasAnyCenterAccess(req, me) && String(task.centerId || "") !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can mark tasks from your center only" });
    }
    if (!userIsAssigneeOnTask(task, req.userId)) {
      return res.status(403).json({ message: "Only assignees can mark a task as not done" });
    }
    if (task.status === "awaiting_approval" || task.approvalStatus === "pending") {
      // If shared multi-assignee, another person may have submitted — claim my own copy first.
      if ((task.assignees || []).length > 1) {
        const originalTask = task;
        const { workingTask, clones, removedSelfFromOriginal } = await claimSharedTaskForAssignee(
          originalTask,
          req.userId,
          { actorId: req.userId }
        );
        for (const c of clones) {
          for (const id of c.assignees || []) invalidateAssigneeSync(id);
        }
        if (removedSelfFromOriginal) {
          await originalTask.save();
        }
        task = workingTask;
        task.status = "pending";
        task.approvalStatus = "none";
        task.submissionRemarks = "";
        task.notDoneApproval = undefined;
      } else {
        return res.status(400).json({ message: "This task is already waiting for approval" });
      }
    }
    if (task.notDoneApproval?.status === "pending") {
      return res.status(400).json({ message: "A not-done request is already pending approval" });
    }
    const workableErr = assertOccurrenceWorkableForAssignee(task);
    if (workableErr) return res.status(400).json({ message: workableErr });

    const remarks = String(req.body.submissionRemarks || req.body.remarks || "Not done for this occurrence").trim();
    if (!remarks) {
      return res.status(400).json({ message: "Remarks are required when marking a task as not done" });
    }

    if ((task.assignees || []).length > 1) {
      const originalTask = task;
      const { workingTask, clones, removedSelfFromOriginal } = await claimSharedTaskForAssignee(
        originalTask,
        req.userId,
        { actorId: req.userId }
      );
      for (const c of clones) {
        for (const id of c.assignees || []) invalidateAssigneeSync(id);
      }
      if (removedSelfFromOriginal) {
        await originalTask.save();
      }
      task = workingTask;
    }

    const occurrenceDue = task.dueDate;
    task.notDoneApproval = {
      dueDate: occurrenceDue,
      remarks,
      submittedAt: new Date(),
      submittedBy: req.userId,
      status: "pending",
    };
    task.submissionRemarks = remarks;
    task.completedAt = null;

    const actorUser = await User.findById(req.userId).lean();
    let advanced = false;
    if (isRecurring(task.taskType)) {
      advanced = await advanceIfRecurring(task, req.userId, actorUser?.name);
      if (!advanced) {
        task.status = "awaiting_approval";
      }
    } else {
      task.status = "awaiting_approval";
    }

    await recordNotDoneSubmission({
      task,
      assigneeId: req.userId,
      remarks,
      occurrenceDueDate: occurrenceDue,
    });

    await task.save();
    await TaskEvent.create({
      taskId: task._id,
      actorId: req.userId,
      eventType: "not_done",
      meta: { dueDate: occurrenceDue, remarks },
    });

    const dueLabel = occurrenceDue ? formatAppDate(occurrenceDue) : "this occurrence";
    const snippet = remarks.slice(0, 240) + (remarks.length > 240 ? "…" : "");
    const approverId = taskAssignerId(task);
    await notifyMany([approverId || task.createdBy], {
      type: "task_approval_request",
      title: "Assignee marked task as not done",
      message: `"${task.title}" was marked not done for ${dueLabel}.${advanced ? " Next occurrence is scheduled." : ""} Remarks: ${snippet}`,
      link: "/for-approval",
    });

    if (task.assignees?.length) {
      await notifyMany(task.assignees, {
        type: "task_status",
        title: "Occurrence marked not done",
        message: advanced
          ? `${task.title} — not done for ${dueLabel}. Next due ${formatAppDate(task.dueDate)}.`
          : `${task.title} — marked not done and sent to your assigner for review.`,
        link: "/pending-recurring",
      });
    }

    for (const id of task.assignees || []) invalidateAssigneeSync(id);
    res.json({ task });
  } catch (e) {
    res.status(500).json({ message: e.message || "Could not mark task as not done" });
  }
});

router.post("/:id/approve", async (req, res) => {
  const me = await actor(req);
  const task = await Task.findById(req.params.id);
  if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
  if (!actorHasAnyCenterAccess(req, me) && String(task.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can approve tasks from your center only" });
  }
  if (!(await canApproveTaskForUser({ userId: req.userId, userRole: req.userRole, task }))) {
    return res.status(403).json({ message: "Only the assigner can approve this task" });
  }

  if (task.notDoneApproval?.status === "pending") {
    // Prefer a real completion submit over a sticky not-done flag on the task.
    const completionPending = await TaskApprovalRecord.findOne({
      taskId: task._id,
      status: "pending",
      kind: "completion",
    })
      .sort({ submittedAt: -1 })
      .lean();
    // Sticky flag + only a not_done pending that is actually work notes (mis-button): still approve as completion.
    const anyPending = !completionPending
      ? await TaskApprovalRecord.findOne({ taskId: task._id, status: "pending" }).sort({ submittedAt: -1 }).lean()
      : null;
    const treatAsCompletion =
      Boolean(completionPending) ||
      (anyPending &&
        anyPending.kind === "not_done" &&
        String(anyPending.submissionRemarks || "").trim() &&
        !looksLikeExplicitNotDoneReason(anyPending.submissionRemarks));

    if (!treatAsCompletion) {
      const occurrenceDue = task.notDoneApproval?.dueDate || task.dueDate;
      task.notDoneApproval.status = "acknowledged";
      task.submissionRemarks = "";
      if (task.status === "awaiting_approval" && !isRecurring(task.taskType)) {
        task.status = "pending";
      }
      await task.save();
      await finalizeApprovalRecord({
        task,
        occurrenceDueDate: occurrenceDue,
        approverId: req.userId,
        status: "not_done_acknowledged",
        extra: { kind: "not_done" },
      });
      await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "not_done_acknowledged", meta: {} });
      if (task.assignees?.length) {
        await notifyMany(task.assignees, {
          type: "task_approved",
          title: "Not done acknowledged",
          message: `Your assigner acknowledged that "${task.title}" was not done for the reported occurrence.`,
          link: isRecurring(task.taskType) ? "/pending-recurring" : "/pending-single",
        });
      }
      for (const id of task.assignees || []) invalidateAssigneeSync(id);
      return res.json({ task });
    }
    // Fall through: completion is waiting — clear stale not-done flag and approve as completed.
    task.notDoneApproval = undefined;
    if (anyPending?.kind === "not_done") {
      await TaskApprovalRecord.updateOne({ _id: anyPending._id }, { $set: { kind: "completion" } });
    }
  }

  const occurrenceDue =
    req.body?.occurrenceDueDate != null && String(req.body.occurrenceDueDate).trim()
      ? new Date(req.body.occurrenceDueDate)
      : await resolveOccurrenceDueForApproval(task);
  if (task.taskType === "daily" && !isOccurrenceDueToday(task.dueDate)) {
    task.dueDate = occurrenceDue;
  }

  const bodyAssignee =
    String(req.body?.assigneeId || "").trim() ||
    (Array.isArray(task.assignees) && task.assignees.length === 1 ? String(task.assignees[0]) : null);

  let approvedRecord = await finalizeApprovalRecord({
    task,
    occurrenceDueDate: occurrenceDue,
    approverId: req.userId,
    status: "approved",
    assigneeId: bodyAssignee,
  });

  // Recovery: wrongly saved as not_done_acknowledged with work remarks (common sticky bug).
  if (!approvedRecord) {
    const mislabeled = await TaskApprovalRecord.findOne({
      taskId: task._id,
      status: "not_done_acknowledged",
      kind: "not_done",
    }).sort({ approvedAt: -1, submittedAt: -1 });
    if (
      mislabeled &&
      String(mislabeled.submissionRemarks || "").trim() &&
      !looksLikeExplicitNotDoneReason(mislabeled.submissionRemarks)
    ) {
      mislabeled.status = "approved";
      mislabeled.kind = "completion";
      mislabeled.approvedAt = mislabeled.approvedAt || new Date();
      mislabeled.approvedBy = req.userId;
      await mislabeled.save();
      approvedRecord = mislabeled;
    }
  }

  // Task still awaiting with remarks but history row missing / already cleared.
  if (!approvedRecord && (task.status === "awaiting_approval" || task.approvalStatus === "pending")) {
    const remarks = String(task.submissionRemarks || task.notDoneApproval?.remarks || "").trim();
    if (remarks) {
      approvedRecord = await finalizeApprovalRecord({
        task,
        occurrenceDueDate: occurrenceDue,
        approverId: req.userId,
        status: "approved",
        assigneeId: bodyAssignee,
        extra: {
          allowCreateWithoutPending: true,
          submissionRemarks: remarks,
          kind: "completion",
          submittedAt: task.updatedAt || new Date(),
        },
      });
    }
  }

  if (!approvedRecord) {
    return res.status(400).json({
      message:
        "No pending submission found for this occurrence. Ask the assignee to submit again with remarks, then approve.",
    });
  }

  task.notDoneApproval = undefined;

  const remainingPending = await TaskApprovalRecord.countDocuments({
    taskId: task._id,
    status: "pending",
    kind: { $in: ["completion", "not_done"] },
  });

  if (remainingPending > 0) {
    const nextPending = await TaskApprovalRecord.findOne({
      taskId: task._id,
      status: "pending",
      kind: "completion",
    })
      .sort({ occurrenceDueDate: 1, submittedAt: -1 })
      .lean();
    task.status = "awaiting_approval";
    task.approvalStatus = "pending";
    task.completedAt = null;
    task.submissionRemarks = nextPending?.submissionRemarks || "";
    if (nextPending?.occurrenceDueDate) {
      task.dueDate = nextPending.occurrenceDueDate;
    }
  } else {
    task.approvalStatus = "approved";
    task.status = "completed";
    task.completedAt = new Date();
    task.submissionRemarks = "";
  }
  task.rejectionRemarks = "";
  task.rejectionMode = "";
  await task.save();
  await TaskEvent.create({
    taskId: task._id,
    actorId: req.userId,
    eventType: "approved",
    meta: { occurrenceDueDate: approvedRecord.occurrenceDueDate || occurrenceDue },
  });
  const actorUser = await User.findById(req.userId).lean();
  if (isRecurring(task.taskType)) {
    await logActivity({
      actor: req.userId,
      actorName: actorUser?.name,
      type: "task_occurrence_completed",
      message: `${actorUser?.name || "Someone"} completed occurrence of ${task.title}`,
      task: task._id,
      taskTitle: task.title,
      taskType: task.taskType,
      meta: { completedFor: occurrenceDue },
    });
  }
  if (task.assignees?.length) {
    await notifyMany(task.assignees, {
      type: "task_approved",
      title: "Task approved",
      message: `${task.title} was approved and marked completed.`,
      link: "/pending-single",
    });
  }
  for (const id of task.assignees || []) invalidateAssigneeSync(id);
  res.json({ task });
});

router.post("/:id/reject", async (req, res) => {
  try {
    const me = await actor(req);
    const { mode = "reassign", remarks } = req.body || {};
    if (!["no_action", "reassign"].includes(mode)) {
      return res.status(400).json({ message: "Invalid mode. Use no_action or reassign." });
    }
    const text = String(remarks || "").trim();
    if (!text) return res.status(400).json({ message: "Remarks are required" });

    const task = await Task.findById(req.params.id);
    if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
    if (!actorHasAnyCenterAccess(req, me) && String(task.centerId || "") !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can reject tasks from your center only" });
    }
    if (!(await canApproveTaskForUser({ userId: req.userId, userRole: req.userRole, task }))) {
      return res.status(403).json({ message: "Only the assigner can reject this task" });
    }

    task.rejectionRemarks = text;
    task.rejectionMode = mode;
    task.approvalStatus = "rejected";
    if (mode === "no_action") {
      task.status = "cancelled";
      task.requiresApproval = false;
    } else {
      task.status = "pending";
      task.requiresApproval = false;
      task.submissionRemarks = "";
    }
    const occurrenceDue = await resolveOccurrenceDueForApproval(task);
    await task.save();
    await finalizeApprovalRecord({
      task,
      occurrenceDueDate: occurrenceDue,
      approverId: req.userId,
      status: "rejected",
      extra: {
        rejectedAt: new Date(),
        rejectionRemarks: text,
        rejectionMode: mode,
        submissionRemarks: task.submissionRemarks,
      },
    });
    await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "rejected", meta: { mode, remarks: text } });

    const actorUser = await User.findById(req.userId).lean();
    await logActivity({
      actor: req.userId,
      actorName: actorUser?.name,
      type: "task_rejected",
      message:
        mode === "no_action"
          ? `${actorUser?.name || "Admin"} permanently closed "${task.title}" (${text.slice(0, 80)}${text.length > 80 ? "…" : ""})`
          : `${actorUser?.name || "Admin"} rejected completion of "${task.title}" for rework (${text.slice(0, 80)}${text.length > 80 ? "…" : ""})`,
      task: task._id,
      taskTitle: task.title,
      taskType: task.taskType,
      meta: { mode, remarks: text },
    });

    if (task.assignees?.length) {
      const msg =
        mode === "no_action"
          ? `${task.title} was permanently closed. Reason: ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`
          : `${task.title} was rejected — please review remarks and resubmit or create a corrected task. Reason: ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`;
      await notifyMany(task.assignees, {
        type: "task_rejected",
        title: mode === "no_action" ? "Task permanently rejected" : "Completion rejected — rework needed",
        message: msg,
        link: mode === "no_action" ? "/pending-single" : "/assign-task",
      });
    }

    for (const id of task.assignees || []) invalidateAssigneeSync(id);
    res.json({ task });
  } catch (e) {
    res.status(500).json({ message: e.message || "Reject failed" });
  }
});

router.delete("/:id", requireManagement, async (req, res) => {
  const me = await actor(req);
  const existing = await Task.findById(req.params.id);
  if (!existing || existing.deletedAt) return res.status(404).json({ message: "Task not found" });
  if (!actorHasAnyCenterAccess(req, me) && String(existing.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can delete tasks from your center only" });
  }

  let where;
  if (managementCreatorOwnsTask(req, existing)) {
    where = { _id: req.params.id };
    if (!actorHasAnyCenterAccess(req, me)) where.centerId = me?.centerId || null;
  } else {
    where = !actorHasAnyCenterAccess(req, me) ? { _id: req.params.id, centerId: me?.centerId || null } : { _id: req.params.id };
    applyMutationScopeForRole(where, req.userId, req.userRole);
  }

  const task = await Task.findOneAndUpdate(where, { deletedAt: new Date() });
  if (!task) return res.status(404).json({ message: "Task not found" });
  await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "deleted", meta: { soft: true } });
  res.json({ ok: true });
});

router.post("/:id/restore", requireManagement, async (req, res) => {
  const me = await actor(req);
  const existing = await Task.findById(req.params.id).lean();
  if (!existing || !existing.deletedAt) return res.status(404).json({ message: "Task not found" });
  if (!actorHasAnyCenterAccess(req, me) && String(existing.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can restore tasks from your center only" });
  }
  if (!(await userCanAccessTaskDoc(existing, req.userId, req.userRole, me?.centerId || null))) {
    return res.status(403).json({ message: "You can only restore tasks assigned to you or tasks you assigned" });
  }
  const task = await Task.findOneAndUpdate({ _id: existing._id }, { deletedAt: null });
  if (!task) return res.status(404).json({ message: "Task not found" });
  await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "restored", meta: {} });
  res.json({ ok: true });
});

router.delete("/:id/hard", requireManagement, async (req, res) => {
  const me = await actor(req);
  const existing = await Task.findById(req.params.id).lean();
  if (!existing) return res.status(404).json({ message: "Task not found" });
  if (!actorHasAnyCenterAccess(req, me) && String(existing.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can delete tasks from your center only" });
  }
  if (!(await userCanAccessTaskDoc(existing, req.userId, req.userRole, me?.centerId || null))) {
    return res.status(403).json({ message: "You can only permanently delete tasks assigned to you or tasks you assigned" });
  }
  await TaskEvent.create({ taskId: existing._id, actorId: req.userId, eventType: "deleted", meta: { soft: false } });
  await Task.deleteOne({ _id: existing._id });
  res.json({ ok: true });
});

export default router;
