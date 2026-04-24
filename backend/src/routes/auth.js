import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { signToken } from "../utils/token.js";
import { authRequired, loadUser } from "../middleware/auth.js";
import { normalizeRole } from "../constants/roles.js";

const router = Router();
const GLOBAL_ACCESS_EMAILS = new Set(["admin@globaltasks.demo", "testing@gmail.com"]);

function effectiveRoleForUser(user) {
  if (!user) return "executor";
  if (GLOBAL_ACCESS_EMAILS.has(String(user.email || "").toLowerCase())) return "ceo";
  return normalizeRole(user.role);
}

router.post("/register", async (req, res, next) => {
  try {
    const { email, password, name, department } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ message: "Email, password, and name are required" });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email already registered" });
    const user = await User.create({
      email: email.toLowerCase(),
      name,
      role: "executor",
      executorKind: "",
      department: department || "",
      passwordHash: await bcrypt.hash(password, 10),
      permissions: ["view_tasks"],
    });
    res.status(201).json({ token: signToken(user), user: user.toJSON() });
  } catch (e) {
    next(e);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() || "" });
    if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const normalizedRole = normalizeRole(user.role);
    if (normalizedRole !== user.role) {
      user.role = normalizedRole;
    }
    const effectiveRole = effectiveRoleForUser(user);
    user.lastAccessAt = new Date();
    await user.save();
    const outUser = user.toJSON();
    outUser.role = effectiveRole;
    res.json({ token: signToken({ ...user.toObject(), role: effectiveRole }), user: outUser });
  } catch (e) {
    next(e);
  }
});

router.get("/me", authRequired, loadUser, (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Authentication required" });
  const outUser = req.user.toJSON();
  outUser.role = effectiveRoleForUser(req.user);
  res.json({ user: outUser });
});

export default router;
