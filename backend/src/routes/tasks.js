import { Router } from "express";
import { Task, TASK_TYPES, TASK_STATUSES, TASK_PRIORITIES } from "../models/Task.js";
import { User } from "../models/User.js";
import { authRequired, requireRoles } from "../middleware/auth.js";
import { notifyMany } from "../services/notificationService.js";
import { logActivity } from "../services/activityService.js";
import { RECURRING_TYPES as RECURRING, isRecurring, computeNextDueDate } from "../utils/recurrence.js";

const router = Router();
router.use(authRequired);

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
]);

function assertTaskPatchPermission(req, body) {
  for (const k of Object.keys(body)) {
    if (ADMIN_TASK_FIELDS.has(k) && req.userRole !== "admin") {
      return "Only admins can edit these task fields";
    }
    if (k === "assignees" && !["admin", "manager"].includes(req.userRole)) {
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
  const { search, status, priority, assignee, taskType, recurring, myTasks, approval } = query;
  const trashOnly = query.trash === "only" || query.bin === "only";
  /** Default lists active tasks; trash/recycle lists soft-deleted only. */
  const filter = trashOnly ? { deletedAt: { $ne: null } } : { deletedAt: null };

  if (search) filter.$or = [{ title: new RegExp(search, "i") }, { description: new RegExp(search, "i") }];
  if (status && status !== "all") {
    filter.status = status;
  } else if (!trashOnly) {
    filter.status = { $ne: "cancelled" };
  }
  if (priority && priority !== "all") filter.priority = priority;
  if (assignee && assignee !== "all") filter.assignees = assignee;
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

  if (myTasks === "true") filter.assignees = userId;
  else if (role === "user") filter.assignees = userId;

  return filter;
}

router.get("/meta", (_req, res) => {
  res.json({ types: TASK_TYPES, statuses: TASK_STATUSES, priorities: TASK_PRIORITIES });
});

router.get("/", async (req, res) => {
  const filter = buildFilter(req.query, req.userId, req.userRole);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 25);

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate("assignees", "name email avatarUrl role")
      .populate("createdBy", "name email")
      .populate("project", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Task.countDocuments(filter),
  ]);

  res.json({ tasks, total, page, limit });
});

router.get("/:id", async (req, res) => {
  const task = await Task.findById(req.params.id)
    .populate("assignees", "name email avatarUrl role")
    .populate("createdBy", "name email")
    .populate("project", "name");
  if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
  res.json({ task });
});

router.post("/", async (req, res, next) => {
  try {
    const payload = { ...req.body, createdBy: req.userId };
    if (!payload.title || !payload.dueDate) return res.status(400).json({ message: "Title and due date required" });
    if (!Array.isArray(payload.assignees)) payload.assignees = payload.assignees ? [payload.assignees] : [];
    if (payload.requiresApproval) payload.approvalStatus = "none";
    const task = await Task.create(payload);

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
    const task = await Task.findById(req.params.id);
    if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });

    const denied = assertTaskPatchPermission(req, req.body);
    if (denied) return res.status(403).json({ message: denied });

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

    const requestedComplete = "status" in req.body && req.body.status === "completed";
    if (requestedComplete && req.userRole !== "admin") {
      task.status = "awaiting_approval";
      task.approvalStatus = "pending";
      task.requiresApproval = true;
      task.completedAt = null;
    } else if (task.status === "completed" && !task.completedAt) {
      task.completedAt = new Date();
    }

    await task.save();

    const justCompleted = prevStatus !== "completed" && task.status === "completed";
    if (justCompleted && !task.requiresApproval) {
      const actor = await User.findById(req.userId).lean();
      await advanceIfRecurring(task, req.userId, actor?.name);
    }

    if (prevStatus !== "awaiting_approval" && task.status === "awaiting_approval") {
      const admins = await User.find({ role: "admin", active: { $ne: false } }).select("_id").lean();
      if (admins.length) {
        await notifyMany(
          admins.map((a) => a._id),
          {
            type: "task_approval_request",
            title: "Completion pending approval",
            message: `An assignee submitted "${task.title}" for completion.`,
            link: "/for-approval",
          }
        );
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

    res.json({ task });
  } catch (e) {
    next(e);
  }
});

router.post("/bulk", async (req, res) => {
  const { ids = [], action, status } = req.body;
  if (!ids.length) return res.json({ ok: true });

  if (action === "delete") {
    await Task.updateMany({ _id: { $in: ids } }, { $set: { deletedAt: new Date() } });
    return res.json({ ok: true });
  }
  if (action === "hard_delete") {
    if (req.userRole !== "admin") return res.status(403).json({ message: "Only admins can permanently delete tasks" });
    await Task.deleteMany({ _id: { $in: ids } });
    return res.json({ ok: true });
  }
  if (action === "restore") {
    await Task.updateMany({ _id: { $in: ids } }, { $set: { deletedAt: null } });
    return res.json({ ok: true });
  }

  if (status === "completed") {
    const actor = await User.findById(req.userId).lean();
    const tasks = await Task.find({ _id: { $in: ids } });
    for (const t of tasks) {
      if (req.userRole !== "admin") {
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
    if (req.userRole !== "admin") {
      const admins = await User.find({ role: "admin", active: { $ne: false } }).select("_id").lean();
      if (admins.length) {
        await notifyMany(
          admins.map((a) => a._id),
          {
            type: "task_approval_request",
            title: "Completions pending approval",
            message: `${tasks.length} task(s) were submitted for completion.`,
            link: "/for-approval",
          }
        );
      }
    }
    return res.json({ ok: true });
  }

  if (status) {
    await Task.updateMany({ _id: { $in: ids } }, { $set: { status } });
  }
  res.json({ ok: true });
});

router.post("/:id/approve", requireRoles("admin"), async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });
  task.approvalStatus = "approved";
  task.status = "completed";
  task.completedAt = new Date();
  task.rejectionRemarks = "";
  task.rejectionMode = "";
  await task.save();
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

router.post("/:id/reject", requireRoles("admin"), async (req, res) => {
  try {
    const { mode = "reassign", remarks } = req.body || {};
    if (!["no_action", "reassign"].includes(mode)) {
      return res.status(400).json({ message: "Invalid mode. Use no_action or reassign." });
    }
    const text = String(remarks || "").trim();
    if (!text) return res.status(400).json({ message: "Remarks are required" });

    const task = await Task.findById(req.params.id);
    if (!task || task.deletedAt) return res.status(404).json({ message: "Task not found" });

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

router.delete("/:id", requireRoles("admin"), async (req, res) => {
  await Task.findByIdAndUpdate(req.params.id, { deletedAt: new Date() });
  res.json({ ok: true });
});

router.post("/:id/restore", async (req, res) => {
  await Task.findByIdAndUpdate(req.params.id, { deletedAt: null });
  res.json({ ok: true });
});

router.delete("/:id/hard", requireRoles("admin", "manager"), async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
