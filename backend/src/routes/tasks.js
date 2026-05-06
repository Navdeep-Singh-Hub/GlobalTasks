import { Router } from "express";
import { Task, TASK_TYPES, TASK_STATUSES, TASK_PRIORITIES } from "../models/Task.js";
import { User } from "../models/User.js";
import { authRequired, requireCenterAssigned, requireManagement, requireRoles } from "../middleware/auth.js";
import { isManagement, isCeo } from "../constants/roles.js";
import { notifyMany } from "../services/notificationService.js";
import { logActivity } from "../services/activityService.js";
import { RECURRING_TYPES as RECURRING, isRecurring, computeNextDueDate } from "../utils/recurrence.js";
import { TaskEvent } from "../models/TaskEvent.js";
import { getAssignableAssigneeIds, getVisibleUserIds } from "../services/hierarchy.js";
import { isWeekOffToday } from "../utils/weekoff.js";
import { assertAllowedDepartmentId } from "../utils/departments.js";

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

function assertTaskPatchPermission(req, body) {
  const isAdminLike = req.userRole === "ceo" || req.userRole === "centre_head";
  for (const k of Object.keys(body)) {
    if (ADMIN_TASK_FIELDS.has(k) && !isAdminLike) {
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
  const { search, status, statusGroup, priority, assignee, taskType, recurring, myTasks, approval, departmentId, centerId, functionTag } = query;
  const trashOnly = query.trash === "only" || query.bin === "only";
  /** Default lists active tasks; trash/recycle lists soft-deleted only. */
  const filter = trashOnly ? { deletedAt: { $ne: null } } : { deletedAt: null };

  if (search) filter.$or = [{ title: new RegExp(search, "i") }, { description: new RegExp(search, "i") }];
  if (statusGroup === "open") {
    filter.status = { $in: ["pending", "in_progress", "awaiting_approval", "overdue"] };
  } else if (status && status !== "all") {
    filter.status = status;
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
      $or: [{ status: "awaiting_approval" }, { requiresApproval: true, approvalStatus: "pending" }],
    };
    if (search) {
      filter.$and = [{ $or: filter.$or }, approvalClause];
      delete filter.$or;
    } else {
      Object.assign(filter, approvalClause);
    }
  }

  if (approval === "true" && role !== "ceo") {
    // Non-CEO users should only review approvals for tasks they assigned.
    filter.createdBy = userId;
  }

  if (myTasks === "true") filter.assignees = userId;
  else if (role === "executor") filter.assignees = userId;

  return filter;
}

function canApproveTask({ userId, userRole, task }) {
  if (!task) return false;
  if (String(task.createdBy || "") === String(userId || "")) return true;
  // Safety fallback for top-level oversight.
  if (userRole === "ceo") return true;
  return false;
}

router.get("/meta", (_req, res) => {
  res.json({ types: TASK_TYPES, statuses: TASK_STATUSES, priorities: TASK_PRIORITIES });
});

router.get("/", async (req, res) => {
  const me = await actor(req);
  const filter = buildFilter(req.query, req.userId, req.userRole);
  if (!isCeo(req.userRole)) filter.centerId = me?.centerId || null;
  const visibleIds = await getVisibleUserIds({ actorId: req.userId, actorRole: req.userRole, centerId: me?.centerId || null });
  if (visibleIds) {
    if (filter.assignees && typeof filter.assignees === "string") {
      if (!visibleIds.includes(String(filter.assignees))) {
        filter._id = { $in: [] };
      }
    } else if (filter.assignees?.$in) {
      filter.assignees.$in = filter.assignees.$in.filter((id) => visibleIds.includes(String(id)));
    } else {
      filter.assignees = { $in: visibleIds };
    }
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 25);

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate("assignees", "name email avatarUrl role")
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
  const visibleIds = await getVisibleUserIds({ actorId: req.userId, actorRole: req.userRole, centerId: me?.centerId || null });
  const task = await Task.findById(req.params.id)
    .populate("assignees", "name email avatarUrl role")
    .populate("createdBy", "name email")
    .populate("project", "name")
    .populate("departmentId", "name code")
    .populate("centerId", "name code");
  if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
  if (!isCeo(req.userRole) && String(task.centerId?._id || task.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can access tasks from your center only" });
  }
  if (visibleIds && req.userRole !== "centre_head") {
    const assignees = (task.assignees || []).map((a) => String(a._id || a));
    if (!assignees.some((id) => visibleIds.includes(id))) {
      return res.status(403).json({ message: "You can access tasks for your hierarchy only" });
    }
  }
  res.json({ task });
});

router.post("/", async (req, res, next) => {
  try {
    const me = await actor(req);
    const payload = { ...req.body, createdBy: req.userId };
    if (!payload.title || !payload.dueDate) return res.status(400).json({ message: "Title and due date required" });
    if (!payload.departmentId) return res.status(400).json({ message: "Department is required" });
    const deptOk = await assertAllowedDepartmentId(payload.departmentId);
    if (!deptOk.ok) return res.status(400).json({ message: deptOk.message });
    if (!payload.functionTag || !String(payload.functionTag).trim()) {
      return res.status(400).json({ message: "Function tag is required" });
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
    const task = await Task.create(payload);
    await TaskEvent.create({
      taskId: task._id,
      actorId: req.userId,
      eventType: "created",
      meta: { status: task.status },
    });

    const creator = await User.findById(req.userId).lean();
    if (task.assignees?.length) {
      await notifyMany(task.assignees.filter((id) => String(id) !== req.userId), {
        type: "task_assigned",
        title: "New task assigned",
        message: `${creator?.name || "Admin"} assigned: ${task.title}`,
        link: "/pending-single",
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
    const visibleIds = await getVisibleUserIds({ actorId: req.userId, actorRole: req.userRole, centerId: me?.centerId || null });
    const task = await Task.findById(req.params.id);
    if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
    if (!isCeo(req.userRole) && String(task.centerId || "") !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can edit tasks from your center only" });
    }
    if (visibleIds && req.userRole !== "centre_head") {
      const assignees = (task.assignees || []).map((a) => String(a));
      if (!assignees.some((id) => visibleIds.includes(id))) {
        return res.status(403).json({ message: "You can edit tasks for your hierarchy only" });
      }
    }

    const denied = assertTaskPatchPermission(req, req.body);
    if (denied) return res.status(403).json({ message: denied });

    if ("departmentId" in req.body) {
      const deptOk = await assertAllowedDepartmentId(req.body.departmentId);
      if (!deptOk.ok) return res.status(400).json({ message: deptOk.message });
    }

    const prevStatus = task.status;
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
      task.status = "awaiting_approval";
      task.approvalStatus = "pending";
      task.requiresApproval = true;
      task.completedAt = null;
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
      await notifyMany([task.createdBy], {
        type: "task_approval_request",
        title: "Completion pending approval",
        message: `An assignee submitted "${task.title}" for completion.`,
        link: "/for-approval",
      });
    }

    if (prevStatus !== task.status && task.assignees?.length) {
      await notifyMany(task.assignees, {
        type: "task_status",
        title: "Task status updated",
        message: `${task.title} → ${task.status.replace("_", " ")}`,
        link: "/pending-single",
      });
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
  const visibleIds = await getVisibleUserIds({ actorId: req.userId, actorRole: req.userRole, centerId: me?.centerId || null });
  if (visibleIds) scope.assignees = { $in: visibleIds };

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
    if (req.userRole === "executor") {
      const meUser = await User.findById(req.userId).select("_id weekOffDays").lean();
      if (isWeekOffToday(meUser?.weekOffDays || [])) {
        return res.status(400).json({ message: "You cannot mark tasks on your week off day." });
      }
    }
    const actor = await User.findById(req.userId).lean();
    const tasks = await Task.find({ _id: { $in: ids }, ...scope });
    for (const t of tasks) {
      if (!isCeo(req.userRole)) {
        t.status = "awaiting_approval";
        t.approvalStatus = "pending";
        t.requiresApproval = true;
        t.completedAt = null;
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
        if (!t.createdBy) continue;
        const key = String(t.createdBy);
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

router.post("/:id/approve", async (req, res) => {
  const me = await actor(req);
  const task = await Task.findById(req.params.id);
  if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
  if (!isCeo(req.userRole) && String(task.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can approve tasks from your center only" });
  }
  if (!canApproveTask({ userId: req.userId, userRole: req.userRole, task })) {
    return res.status(403).json({ message: "Only the assigner can approve this task" });
  }
  task.approvalStatus = "approved";
  task.status = "completed";
  task.completedAt = new Date();
  task.rejectionRemarks = "";
  task.rejectionMode = "";
  await task.save();
  await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "approved", meta: {} });
  const actor = await User.findById(req.userId).lean();
  await advanceIfRecurring(task, req.userId, actor?.name);
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
    if (!canApproveTask({ userId: req.userId, userRole: req.userRole, task })) {
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
    await task.save();
    await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "rejected", meta: { mode, remarks: text } });

    const actor = await User.findById(req.userId).lean();
    await logActivity({
      actor: req.userId,
      actorName: actor?.name,
      type: "task_rejected",
      message:
        mode === "no_action"
          ? `${actor?.name || "Admin"} permanently closed "${task.title}" (${text.slice(0, 80)}${text.length > 80 ? "…" : ""})`
          : `${actor?.name || "Admin"} rejected completion of "${task.title}" for rework (${text.slice(0, 80)}${text.length > 80 ? "…" : ""})`,
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
  const where = !isCeo(req.userRole) ? { _id: req.params.id, centerId: me?.centerId || null } : { _id: req.params.id };
  const visibleIds = await getVisibleUserIds({ actorId: req.userId, actorRole: req.userRole, centerId: me?.centerId || null });
  if (visibleIds && req.userRole !== "centre_head") where.assignees = { $in: visibleIds };
  const task = await Task.findOneAndUpdate(where, { deletedAt: new Date() });
  if (task) await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "deleted", meta: { soft: true } });
  res.json({ ok: true });
});

router.post("/:id/restore", async (req, res) => {
  const me = await actor(req);
  const where = !isCeo(req.userRole) ? { _id: req.params.id, centerId: me?.centerId || null } : { _id: req.params.id };
  const visibleIds = await getVisibleUserIds({ actorId: req.userId, actorRole: req.userRole, centerId: me?.centerId || null });
  if (visibleIds && req.userRole !== "centre_head") where.assignees = { $in: visibleIds };
  const task = await Task.findOneAndUpdate(where, { deletedAt: null });
  if (task) await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "restored", meta: {} });
  res.json({ ok: true });
});

router.delete("/:id/hard", requireRoles("ceo", "centre_head"), async (req, res) => {
  const me = await actor(req);
  const where = !isCeo(req.userRole) ? { _id: req.params.id, centerId: me?.centerId || null } : { _id: req.params.id };
  const visibleIds = await getVisibleUserIds({ actorId: req.userId, actorRole: req.userRole, centerId: me?.centerId || null });
  if (visibleIds && req.userRole !== "centre_head") where.assignees = { $in: visibleIds };
  const task = await Task.findOne(where);
  if (task) await TaskEvent.create({ taskId: task._id, actorId: req.userId, eventType: "deleted", meta: { soft: false } });
  await Task.deleteOne(where);
  res.json({ ok: true });
});

export default router;
