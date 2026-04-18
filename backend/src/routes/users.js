import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { authRequired, requireRoles } from "../middleware/auth.js";
import { logActivity } from "../services/activityService.js";

const router = Router();
router.use(authRequired);

router.get("/", async (req, res) => {
  const { search, role, status, department } = req.query;
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
  if (status === "active") q.active = true;
  if (status === "inactive") q.active = false;

  const users = await User.find(q).sort({ createdAt: -1 }).lean();
  res.json({ users: users.map(({ passwordHash, ...u }) => u) });
});

router.get("/departments", async (_req, res) => {
  const list = await User.distinct("department");
  res.json({ departments: list.filter(Boolean) });
});

router.post("/", requireRoles("admin", "manager"), async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone = "",
      role = "user",
      department = "",
      title = "",
      avatarUrl = "",
      permissions,
      password = "welcome123",
    } = req.body;
    if (!name || !email) return res.status(400).json({ message: "Name and email required" });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email already in use" });
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      role,
      department,
      title: title || "",
      avatarUrl: avatarUrl || "",
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

router.patch("/:id", requireRoles("admin", "manager"), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { name, email, role, title, avatarUrl, department, phone, permissions, active } = req.body;
    if (name !== undefined) user.name = name;
    if (email !== undefined && typeof email === "string") {
      const normalized = email.toLowerCase().trim();
      if (!normalized) return res.status(400).json({ message: "Email cannot be empty" });
      const taken = await User.findOne({ email: normalized, _id: { $ne: user._id } });
      if (taken) return res.status(409).json({ message: "Email already in use" });
      user.email = normalized;
    }
    if (role && ["admin", "manager", "user"].includes(role)) user.role = role;
    if (title !== undefined) user.title = title;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
    if (department !== undefined) user.department = department;
    if (phone !== undefined) user.phone = phone;
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

router.post("/:id/reset-password", requireRoles("admin"), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  const pwd = req.body.password || "welcome123";
  user.passwordHash = await bcrypt.hash(pwd, 10);
  await user.save();
  res.json({ ok: true });
});

export default router;
