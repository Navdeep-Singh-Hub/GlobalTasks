import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { signToken } from "../utils/token.js";
import { authRequired, loadUser } from "../middleware/auth.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const { email, password, name, role, department } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ message: "Email, password, and name are required" });
    }
    const safeRole = ["admin", "manager", "user"].includes(role) ? role : "user";
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email already registered" });
    const user = await User.create({
      email: email.toLowerCase(),
      name,
      role: safeRole,
      department: department || "",
      passwordHash: await bcrypt.hash(password, 10),
      permissions: safeRole === "admin" ? ["view_tasks", "assign_tasks", "manage_users", "approve_tasks"] : ["view_tasks"],
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
    user.lastAccessAt = new Date();
    await user.save();
    res.json({ token: signToken(user), user: user.toJSON() });
  } catch (e) {
    next(e);
  }
});

router.get("/me", authRequired, loadUser, (req, res) => res.json({ user: req.user }));

export default router;
