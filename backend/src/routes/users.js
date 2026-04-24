import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { TaskEvent } from "../models/TaskEvent.js";
import { Activity } from "../models/Activity.js";
import { Notification } from "../models/Notification.js";
import { Escalation } from "../models/Escalation.js";
import { DailyReport } from "../models/DailyReport.js";
import { TherapistSession } from "../models/TherapistSession.js";
import { Project } from "../models/Project.js";
import { TaskTemplate } from "../models/TaskTemplate.js";
import { authRequired, requireCenterAssigned, requireManagement, requireRoles } from "../middleware/auth.js";
import { logActivity } from "../services/activityService.js";
import { USER_ROLES, EXECUTOR_KINDS, canAssignRole, isCeo } from "../constants/roles.js";
import { getVisibleUserIds } from "../services/hierarchy.js";
import { normalizeWeekOffDays } from "../utils/weekoff.js";

const router = Router();
router.use(authRequired);
router.use(requireCenterAssigned);

async function actor(req) {
  if (req._actor) return req._actor;
  req._actor = await User.findById(req.userId).select("_id role centerId").lean();
  return req._actor;
}

router.get("/", async (req, res) => {
  const { search, role, status, department, centerId, reportsTo } = req.query;
  const me = await actor(req);
  const q = {};
  if (search) {
    q.$or = [
      { name: new RegExp(search, "i") },
      { email: new RegExp(search, "i") },
      { phone: new RegExp(search, "i") },
    ];
  }
  if (role && role !== "all") q.role = role;
  if (department && department !== "all") q.department = department;
  if (centerId && centerId !== "all") q.centerId = centerId;
  if (reportsTo && reportsTo !== "all") q.reportsTo = reportsTo;
  if (status === "active") q.active = true;
  if (status === "inactive") q.active = false;
  if (!isCeo(req.userRole)) q.centerId = me?.centerId || null;
  const visibleIds = await getVisibleUserIds({ actorId: req.userId, actorRole: req.userRole, centerId: me?.centerId || null });
  if (visibleIds) q._id = { $in: visibleIds };

  const users = await User.find(q)
    .populate("centerId", "name code")
    .populate("departmentPrimary", "name code")
    .populate("reportsTo", "name role")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ users: users.map(({ passwordHash, ...u }) => u) });
});

router.get("/departments", async (_req, res) => {
  const me = await actor(_req);
  const list = await User.distinct("department", isCeo(_req.userRole) ? {} : { centerId: me?.centerId || null });
  res.json({ departments: list.filter(Boolean) });
});

router.post("/", requireManagement, async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone = "",
      role = "executor",
      executorKind = "",
      department = "",
      departmentPrimary = null,
      centerId = null,
      reportsTo = null,
      title = "",
      avatarUrl = "",
      weekOffDays = [],
      permissions,
      password = "welcome123",
    } = req.body;
    if (!name || !email || !String(phone || "").trim()) return res.status(400).json({ message: "Name, email and phone are required" });
    if (!centerId) return res.status(400).json({ message: "Center is required" });
    if (!USER_ROLES.includes(role)) return res.status(400).json({ message: "Invalid role" });
    if (!canAssignRole(req.userRole, role)) {
      return res.status(403).json({ message: "You cannot assign this role" });
    }
    if (executorKind && !EXECUTOR_KINDS.includes(executorKind)) {
      return res.status(400).json({ message: "Invalid executor kind" });
    }
    const me = await actor(req);
    if (!isCeo(req.userRole) && String(me?.centerId || "") !== String(centerId)) {
      return res.status(403).json({ message: "You can only create users in your own center" });
    }
    if (role === "centre_head") {
      const existingCentreHead = await User.findOne({ role: "centre_head", centerId, _id: { $ne: req.userId } }).lean();
      if (existingCentreHead) return res.status(409).json({ message: "This center already has a Centre Head" });
    }
    let reportsToId = reportsTo || null;
    if (role === "executor" && executorKind === "therapist") {
      if (!reportsToId) {
        return res.status(400).json({ message: "Supervisor is required for therapist executor" });
      }
      const supervisor = await User.findById(reportsToId).select("_id role centerId").lean();
      if (!supervisor || supervisor.role !== "supervisor") {
        return res.status(400).json({ message: "Therapist must be mapped to a supervisor" });
      }
      if (String(supervisor.centerId || "") !== String(centerId)) {
        return res.status(400).json({ message: "Therapist supervisor must belong to the same center" });
      }
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email already in use" });

    const ek = role === "executor" && executorKind ? executorKind : "";
    const normalizedWeekOff = normalizeWeekOffDays(weekOffDays);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      role,
      executorKind: ek,
      department,
      departmentPrimary,
      centerId,
      reportsTo: reportsToId,
      title: title || "",
      avatarUrl: avatarUrl || "",
      weekOffDays: normalizedWeekOff,
      permissions: permissions?.length ? permissions : ["view_tasks"],
      passwordHash: await bcrypt.hash(password, 10),
    });
    await logActivity({
      actor: req.userId,
      type: "user_created",
      message: `${user.name} was added as ${user.role}`,
    });
    res.status(201).json({ user: user.toJSON() });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", requireManagement, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { name, email, role, title, avatarUrl, department, departmentPrimary, centerId, reportsTo, phone, permissions, active, executorKind, weekOffDays } =
      req.body;
    const me = await actor(req);
    if (name !== undefined) user.name = name;
    if (email !== undefined && typeof email === "string") {
      const normalized = email.toLowerCase().trim();
      if (!normalized) return res.status(400).json({ message: "Email cannot be empty" });
      const taken = await User.findOne({ email: normalized, _id: { $ne: user._id } });
      if (taken) return res.status(409).json({ message: "Email already in use" });
      user.email = normalized;
    }
    if (role !== undefined && role !== user.role) {
      if (!USER_ROLES.includes(role)) return res.status(400).json({ message: "Invalid role" });
      if (!canAssignRole(req.userRole, role)) return res.status(403).json({ message: "You cannot assign this role" });
      user.role = role;
      if (role !== "executor") user.executorKind = "";
    }
    if (executorKind !== undefined) {
      if (executorKind && !EXECUTOR_KINDS.includes(executorKind)) {
        return res.status(400).json({ message: "Invalid executor kind" });
      }
      if (user.role === "executor") user.executorKind = executorKind || "";
    }
    if (title !== undefined) user.title = title;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
    if (department !== undefined) user.department = department;
    if (departmentPrimary !== undefined) user.departmentPrimary = departmentPrimary || null;
    if (centerId !== undefined) {
      if (!centerId) return res.status(400).json({ message: "Center is required" });
      if (!isCeo(req.userRole) && String(me?.centerId || "") !== String(centerId)) {
        return res.status(403).json({ message: "You can only assign users within your center" });
      }
      user.centerId = centerId;
    }
    const nextRole = role ?? user.role;
    const nextCenter = centerId ?? user.centerId;
    if (nextRole === "centre_head") {
      const existingCentreHead = await User.findOne({ role: "centre_head", centerId: nextCenter, _id: { $ne: user._id } }).lean();
      if (existingCentreHead) return res.status(409).json({ message: "This center already has a Centre Head" });
    }
    if (reportsTo !== undefined) user.reportsTo = reportsTo || null;
    if (user.role === "executor" && user.executorKind === "therapist") {
      if (!user.reportsTo) {
        return res.status(400).json({ message: "Supervisor is required for therapist executor" });
      }
      const supervisor = await User.findById(user.reportsTo).select("_id role centerId").lean();
      if (!supervisor || supervisor.role !== "supervisor") {
        return res.status(400).json({ message: "Therapist must be mapped to a supervisor" });
      }
      if (String(supervisor.centerId || "") !== String(user.centerId || "")) {
        return res.status(400).json({ message: "Therapist supervisor must belong to the same center" });
      }
    }
    if (phone !== undefined) user.phone = phone;
    if (weekOffDays !== undefined) user.weekOffDays = normalizeWeekOffDays(weekOffDays);
    if (Array.isArray(permissions)) user.permissions = permissions;
    if (typeof active === "boolean") {
      user.active = active;
      user.deactivatedAt = active ? null : new Date();
    }
    await user.save();
    res.json({ user: user.toJSON() });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/reset-password", requireRoles("ceo", "centre_head"), async (req, res) => {
  const me = await actor(req);
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!isCeo(req.userRole) && String(user.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can reset passwords only for your center users" });
  }
  const pwd = req.body.password || "welcome123";
  user.passwordHash = await bcrypt.hash(pwd, 10);
  await user.save();
  res.json({ ok: true });
});

router.delete("/:id", requireRoles("ceo"), async (req, res) => {
  const userId = String(req.params.id || "");
  if (!userId) return res.status(400).json({ message: "User id is required" });
  if (userId === String(req.userId)) return res.status(400).json({ message: "CEO cannot delete own account" });

  const user = await User.findById(userId).select("_id name role").lean();
  if (!user) return res.status(404).json({ message: "User not found" });

  const taskIds = await Task.find({
    $or: [{ createdBy: user._id }, { assignees: user._id }],
  })
    .distinct("_id");

  await Promise.all([
    Task.deleteMany({ _id: { $in: taskIds } }),
    TaskEvent.deleteMany({
      $or: [{ taskId: { $in: taskIds } }, { actorId: user._id }],
    }),
    Escalation.deleteMany({ taskId: { $in: taskIds } }),
    Activity.deleteMany({
      $or: [{ actor: user._id }, { task: { $in: taskIds } }],
    }),
    Notification.deleteMany({ user: user._id }),
    DailyReport.deleteMany({ userId: user._id }),
    TherapistSession.deleteMany({
      $or: [{ therapistId: user._id }, { createdBy: user._id }, { markedBy: user._id }],
    }),
    Project.deleteMany({ owner: user._id }),
    TaskTemplate.deleteMany({ createdBy: user._id }),
    User.updateMany({ reportsTo: user._id }, { $set: { reportsTo: null } }),
    User.deleteOne({ _id: user._id }),
  ]);

  await logActivity({
    actor: req.userId,
    type: "user_deleted",
    message: `${user.name} and linked data were permanently deleted`,
    meta: { deletedUserId: String(user._id), deletedUserRole: user.role },
  });

  res.json({ ok: true });
});

export default router;
