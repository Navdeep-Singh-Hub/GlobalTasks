import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.userRole)) return res.status(403).json({ message: "Insufficient permissions" });
    next();
  };
}

export async function loadUser(req, _res, next) {
  if (!req.userId) return next();
  req.user = await User.findById(req.userId);
  if (req.user) {
    req.user.lastAccessAt = new Date();
    await req.user.save().catch(() => {});
  }
  next();
}
