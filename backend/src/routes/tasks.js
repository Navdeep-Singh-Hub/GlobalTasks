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
  applyWorkableTodayDueFilter,
  isOccurrenceWorkableToday,
} from "../utils/recurrence.js";
import { TaskEvent } from "../models/TaskEvent.js";
import { getAssignableAssigneeIds } from "../services/hierarchy.js";
import { canApproveTaskForUser } from "../services/taskApprovalRouting.js";
import { isWeekOffToday } from "../utils/weekoff.js";
import { assertAllowedDepartmentId } from "../utils/departments.js";
import { queueTaskAssignedWhatsApp } from "../services/whatsappTaskAssignment.js";
import {
  recordTaskSubmission,
  recordNotDoneSubmission,
  finalizeApprovalRecord,
  backfillApprovalRecordsFromEvents,
  assignerScopeClause,
} from "../services/taskApprovalHistory.js";

const router = Router();
router.use(authRequired);
router.use(requireCenterAssigned);

async function actor(req) {
  if (req._actor) return req._actor;
  req._actor = await User.findById(req.userId).select("_id role centerId").lean();
  return req._actor;
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
  if (task.requiresApproval) task.approvalStatus = "none";
  await task.save();
  return true;
}

function buildFilter(query, userId, role) {
  const {
    search,
    status,
    statusGroup,
    priority,
    assignee,
    taskType,
    recurring,
    myTasks,
    approval,
    departmentId,
    centerId,
    functionTag,
    workableToday,
  } = query;
  const trashOnly = query.trash === "only" || query.bin === "only";
  /** Default lists active tasks; trash/recycle lists soft-deleted only. */
  const filter = trashOnly ? { deletedAt: { $ne: null } } : { deletedAt: null };

  if (search) filter.$or = [{ title: new RegExp(search, "i") }, { description: new RegExp(search, "i") }];
  if (status && status !== "all") {
    filter.status = status;
  } else if (statusGroup === "open") {
    filter.status = { $in: ["pending", "in_progress", "awaiting_approval", "overdue"] };
  } else if (!trashOnly) {
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
  if (approval === "true") {
    const approvalClause = {
      $or: [
        { status: "awaiting_approval" },
        { requiresApproval: true, approvalStatus: "pending" },
        { "notDoneApproval.status": "pending" },
      ],
    };
    if (search) {
      filter.$and = [{ $or: filter.$or }, approvalClause];
      delete filter.$or;
    } else {
      Object.assign(filter, approvalClause);
    }
  }

  if (myTasks === "true") filter.assignees = userId;
  else if (isAssigneeOnly(role)) filter.assignees = userId;

  if (workableToday === "true" && recurring === "true") {
    applyWorkableTodayDueFilter(filter);
  }

  return filter;
}

function assertOccurrenceWorkableForAssignee(task) {
  if (!isRecurring(task.taskType)) return null;
  if (!isOccurrenceWorkableToday(task.dueDate)) {
    return "This occurrence is not due yet. It will appear on its due date.";
  }
  return null;
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

function applyListScopeForRole(filter, { userId, role, query }) {
  if (isCeo(role)) return;
  const masterScope = String(query.masterScope || "").toLowerCase() === "true";
  if (masterScope) {
    const masterRelation =
      String(query.masterRelation || "").toLowerCase() === "assigned" ? "assigned" : "created";
    applyMasterScopeFilter(filter, userId, masterRelation);
    return;
  }
  if (isAssigneeOnly(role) || query.myTasks === "true") {
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

function userCanAccessTaskDoc(task, userId, role) {
  const uid = String(userId || "");
  if (isCeo(role)) return true;
  if (taskAssignerId(task) === uid) return true;
  if (isAssigneeOnly(role)) return userIsAssigneeOnTask(task, uid);
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

router.get("/", async (req, res) => {
  const me = await actor(req);
  const filter = buildFilter(req.query, req.userId, req.userRole);
  if (!isCeo(req.userRole)) filter.centerId = me?.centerId || null;
  applyListScopeForRole(filter, { userId: req.userId, role: req.userRole, query: req.query });
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 25);

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate("assignees", "name email avatarUrl role")
      .populate("assignedBy", "name email")
      .populate("createdBy", "name email")
      .populate("project", "name")
      .populate("departmentId", "name code")
      .populate("centerId", "name code")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Task.countDocuments(filter),
  ]);

  res.json({ tasks, total, page, limit });
});

router.get("/:id", async (req, res) => {
  const me = await actor(req);
  const task = await Task.findById(req.params.id)
    .populate("assignees", "name email avatarUrl role")
    .populate("assignedBy", "name email")
    .populate("createdBy", "name email")
    .populate("project", "name")
    .populate("departmentId", "name code")
    .populate("centerId", "name code");
  if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
  if (!isCeo(req.userRole) && String(task.centerId?._id || task.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can access tasks from your center only" });
  }
  if (!userCanAccessTaskDoc(task, req.userId, req.userRole)) {
    return res.status(403).json({ message: "You can only access tasks assigned to you or tasks you assigned" });
  }
  res.json({ task });
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
    if (!isCeo(req.userRole) && String(payload.centerId) !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can only create tasks in your center" });
    }
    if (!Array.isArray(payload.assignees)) payload.assignees = payload.assignees ? [payload.assignees] : [];
    const assignableIds = await getAssignableAssigneeIds({ actorId: req.userId, actorRole: req.userRole, centerId: payload.centerId });
    if (payload.assignees.length) {
      if (assignableIds.length === 0) return res.status(403).json({ message: "You cannot assign tasks to users" });
      const invalidAssignee = payload.assignees.find((id) => !assignableIds.includes(String(id)));
      if (invalidAssignee) {
        return res.status(403).json({ message: "You can only assign tasks to your allowed hierarchy users" });
      }
    }
    if (payload.assignees.length) {
      const crossCenter = await User.countDocuments({ _id: { $in: payload.assignees }, centerId: { $ne: payload.centerId } });
      if (crossCenter > 0) return res.status(400).json({ message: "All assignees must belong to the selected center" });
    }
    if (!payload.requiredInputsSchema) payload.requiredInputsSchema = { type: "object", properties: {}, required: [] };
    if (!payload.inputPayload) payload.inputPayload = {};
    if (payload.requiresApproval) payload.approvalStatus = "none";
    payload.assignedBy = req.userId;
    payload.createdBy = req.userId;
    const task = await Task.create(payload);
    await TaskEvent.create({
      taskId: task._id,
      actorId: req.userId,
      eventType: "created",
      meta: { status: task.status },
    });

    const creator = await User.findById(req.userId).lean();
    if (task.assignees?.length) {
      const notifyIds = task.assignees.filter((id) => String(id) !== req.userId);
      await notifyMany(notifyIds, {
        type: "task_assigned",
        title: "New task assigned",
        message: `${creator?.name || "Admin"} assigned: ${task.title}`,
        link: "/pending-single",
      });
      queueTaskAssignedWhatsApp({
        taskId: task._id,
        assigneeIds: notifyIds,
        assignedByUserId: req.userId,
      });
    }
    await logActivity({
      actor: req.userId,
      actorName: creator?.name,
      type: "task_assigned",
      message: `${creator?.name || "Admin"} assigned ${task.title}`,
      task: task._id,
      taskTitle: task.title,
      taskType: task.taskType,
    });

    res.status(201).json({ task });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const me = await actor(req);
    const task = await Task.findById(req.params.id);
    if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
    if (!isCeo(req.userRole) && String(task.centerId || "") !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can edit tasks from your center only" });
    }
    if (!managementCreatorOwnsTask(req, task) && !userCanAccessTaskDoc(task, req.userId, req.userRole)) {
      return res.status(403).json({ message: "You can only edit tasks assigned to you or that you created" });
    }

    const denied = assertTaskPatchPermission(req, req.body, task);
    if (denied) return res.status(403).json({ message: denied });

    if ("departmentId" in req.body) {
      const deptOk = await assertAllowedDepartmentId(req.body.departmentId);
      if (!deptOk.ok) return res.status(400).json({ message: deptOk.message });
    }

    const prevStatus = task.status;
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
    if ("centerId" in req.body && !isCeo(req.userRole) && String(req.body.centerId || "") !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can only set your center on tasks" });
    }
    if ("assignees" in req.body) {
      const assignableIds = await getAssignableAssigneeIds({ actorId: req.userId, actorRole: req.userRole, centerId: task.centerId });
      if (task.assignees?.length) {
        if (assignableIds.length === 0) return res.status(403).json({ message: "You cannot assign tasks to users" });
        const invalidAssignee = task.assignees.find((id) => !assignableIds.includes(String(id)));
        if (invalidAssignee) {
          return res.status(403).json({ message: "You can only assign tasks to your allowed hierarchy users" });
        }
      }
    }
    if (task.assignees?.length) {
      const crossCenter = await User.countDocuments({ _id: { $in: task.assignees }, centerId: { $ne: task.centerId } });
      if (crossCenter > 0) return res.status(400).json({ message: "All assignees must belong to task center" });
    }

    const requestedComplete = "status" in req.body && req.body.status === "completed";
    if (requestedComplete && (task.assignees || []).some((id) => String(id) === String(req.userId))) {
      const meUser = await User.findById(req.userId).select("_id weekOffDays").lean();
      if (isWeekOffToday(meUser?.weekOffDays || [])) {
        return res.status(400).json({ message: "You cannot mark tasks on your week off day." });
      }
    }
    const requiredFields = Array.isArray(task.requiredInputsSchema?.required) ? task.requiredInputsSchema.required : [];
    const payloadKeys = task.inputPayload && typeof task.inputPayload === "object" ? Object.keys(task.inputPayload) : [];
    const filledRequired = requiredFields.filter((k) => payloadKeys.includes(k) && task.inputPayload[k] !== "" && task.inputPayload[k] !== null)
      .length;
    task.inputCompletionPercent = requiredFields.length ? Math.round((filledRequired / requiredFields.length) * 100) : 100;
    if (requestedComplete && requiredFields.length && filledRequired < requiredFields.length) {
      return res.status(400).json({
        message: "Required inputs missing",
        errors: requiredFields
          .filter((k) => !payloadKeys.includes(k) || task.inputPayload[k] === "" || task.inputPayload[k] === null)
          .map((field) => ({ field, issue: "required" })),
      });
    }
    if (requestedComplete && !isCeo(req.userRole)) {
      const workableErr = assertOccurrenceWorkableForAssignee(task);
      if (workableErr) return res.status(400).json({ message: workableErr });
      const submissionRemarks = String(req.body.submissionRemarks || "").trim();
      if (!submissionRemarks) {
        return res.status(400).json({ message: "Remarks are required when submitting for approval" });
      }
      task.submissionRemarks = submissionRemarks;
      task.status = "awaiting_approval";
      task.approvalStatus = "pending";
      task.requiresApproval = true;
      task.completedAt = null;
    } else if (task.status === "in_progress" || task.status === "pending") {
      if ("submissionRemarks" in req.body) task.submissionRemarks = "";
    } else if (task.status === "completed" && !task.completedAt) {
      task.completedAt = new Date();
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
      await recordTaskSubmission({
        task,
        assigneeId: req.userId,
        remarks: task.submissionRemarks,
        kind: "completion",
      });
      const note = String(task.submissionRemarks || "").trim();
      const snippet = note ? ` Remarks: ${note.slice(0, 240)}${note.length > 240 ? "…" : ""}` : "";
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
  const scope = !isCeo(req.userRole) ? { centerId: me?.centerId || null } : {};
  applyMutationScopeForRole(scope, req.userId, req.userRole);

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
    if (isAssigneeOnly(req.userRole)) {
      const meUser = await User.findById(req.userId).select("_id weekOffDays").lean();
      if (isWeekOffToday(meUser?.weekOffDays || [])) {
        return res.status(400).json({ message: "You cannot mark tasks on your week off day." });
      }
    }
    const submissionRemarks = String(req.body.submissionRemarks || "").trim();
    if (!isCeo(req.userRole) && !submissionRemarks) {
      return res.status(400).json({ message: "Remarks are required when submitting for approval" });
    }
    if (!isCeo(req.userRole)) {
      const tasksToCheck = await Task.find({ _id: { $in: ids }, ...scope }).lean();
      const tooEarly = tasksToCheck.find((t) => assertOccurrenceWorkableForAssignee(t));
      if (tooEarly) {
        return res.status(400).json({ message: assertOccurrenceWorkableForAssignee(tooEarly) });
      }
    }
    const actor = await User.findById(req.userId).lean();
    const tasks = await Task.find({ _id: { $in: ids }, ...scope });
    for (const t of tasks) {
      if (!isCeo(req.userRole)) {
        t.submissionRemarks = submissionRemarks;
        t.status = "awaiting_approval";
        t.approvalStatus = "pending";
        t.requiresApproval = true;
        t.completedAt = null;
        // eslint-disable-next-line no-await-in-loop
        await recordTaskSubmission({
          task: t,
          assigneeId: req.userId,
          remarks: submissionRemarks,
          kind: "completion",
        });
      } else {
        t.status = "completed";
        if (!t.completedAt) t.completedAt = new Date();
        if (!t.requiresApproval) await advanceIfRecurring(t, req.userId, actor?.name);
      }
      await t.save();
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

router.post("/:id/not-done", async (req, res) => {
  try {
    const me = await actor(req);
    const task = await Task.findById(req.params.id);
    if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
    if (!isCeo(req.userRole) && String(task.centerId || "") !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can mark tasks from your center only" });
    }
    if (!userIsAssigneeOnTask(task, req.userId)) {
      return res.status(403).json({ message: "Only assignees can mark a task as not done" });
    }
    if (task.status === "awaiting_approval" || task.approvalStatus === "pending") {
      return res.status(400).json({ message: "This task is already waiting for approval" });
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

    const dueLabel = occurrenceDue ? new Date(occurrenceDue).toLocaleDateString() : "this occurrence";
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
          ? `${task.title} — not done for ${dueLabel}. Next due ${new Date(task.dueDate).toLocaleDateString()}.`
          : `${task.title} — marked not done and sent to your assigner for review.`,
        link: "/pending-recurring",
      });
    }

    res.json({ task });
  } catch (e) {
    res.status(500).json({ message: e.message || "Could not mark task as not done" });
  }
});

router.post("/:id/approve", async (req, res) => {
  const me = await actor(req);
  const task = await Task.findById(req.params.id);
  if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
  if (!isCeo(req.userRole) && String(task.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can approve tasks from your center only" });
  }
  if (!(await canApproveTaskForUser({ userId: req.userId, userRole: req.userRole, task }))) {
    return res.status(403).json({ message: "Only the assigner can approve this task" });
  }

  if (task.notDoneApproval?.status === "pending") {
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
    return res.json({ task });
  }

  const occurrenceDue = task.dueDate;
  task.approvalStatus = "approved";
  task.status = "completed";
  task.completedAt = new Date();
  task.rejectionRemarks = "";
  task.rejectionMode = "";
  await task.save();
  await finalizeApprovalRecord({
    task,
    occurrenceDueDate: occurrenceDue,
    approverId: req.userId,
    status: "approved",
  });
  await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "approved", meta: { occurrenceDueDate: occurrenceDue } });
  const actorUser = await User.findById(req.userId).lean();
  await advanceIfRecurring(task, req.userId, actorUser?.name);
  if (task.assignees?.length) {
    await notifyMany(task.assignees, {
      type: "task_approved",
      title: "Task approved",
      message: `${task.title} was approved and marked completed.`,
      link: "/pending-single",
    });
  }
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
    if (!isCeo(req.userRole) && String(task.centerId || "") !== String(me?.centerId || "")) {
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
    }
    const occurrenceDue = task.dueDate;
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

    res.json({ task });
  } catch (e) {
    res.status(500).json({ message: e.message || "Reject failed" });
  }
});

router.delete("/:id", requireManagement, async (req, res) => {
  const me = await actor(req);
  const existing = await Task.findById(req.params.id);
  if (!existing || existing.deletedAt) return res.status(404).json({ message: "Task not found" });
  if (!isCeo(req.userRole) && String(existing.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can delete tasks from your center only" });
  }

  let where;
  if (managementCreatorOwnsTask(req, existing)) {
    where = { _id: req.params.id };
    if (!isCeo(req.userRole)) where.centerId = me?.centerId || null;
  } else {
    where = !isCeo(req.userRole) ? { _id: req.params.id, centerId: me?.centerId || null } : { _id: req.params.id };
    applyMutationScopeForRole(where, req.userId, req.userRole);
  }

  const task = await Task.findOneAndUpdate(where, { deletedAt: new Date() });
  if (!task) return res.status(404).json({ message: "Task not found" });
  await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "deleted", meta: { soft: true } });
  res.json({ ok: true });
});

router.post("/:id/restore", async (req, res) => {
  const me = await actor(req);
  const where = !isCeo(req.userRole) ? { _id: req.params.id, centerId: me?.centerId || null } : { _id: req.params.id };
  applyMutationScopeForRole(where, req.userId, req.userRole);
  const task = await Task.findOneAndUpdate(where, { deletedAt: null });
  if (task) await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "restored", meta: {} });
  res.json({ ok: true });
});

router.delete("/:id/hard", requireRoles("ceo", "centre_head"), async (req, res) => {
  const me = await actor(req);
  const where = !isCeo(req.userRole) ? { _id: req.params.id, centerId: me?.centerId || null } : { _id: req.params.id };
  applyMutationScopeForRole(where, req.userId, req.userRole);
  const task = await Task.findOne(where);
  if (task) await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "deleted", meta: { soft: false } });
  await Task.deleteOne(where);
  res.json({ ok: true });
});

export default router;
