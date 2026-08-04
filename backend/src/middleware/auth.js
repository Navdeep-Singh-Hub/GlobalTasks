import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { normalizeRole, isManagement, isCeo } from "../constants/roles.js";

export function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    req.userRole = normalizeRole(payload.role);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRoles(...roles) {
  const normalized = roles.map((r) => normalizeRole(r));
  return (req, res, next) => {
    if (!normalized.includes(req.userRole)) return res.status(403).json({ message: "Insufficient permissions" });
    next();
  };
}

export function requireManagement(req, res, next) {
  if (!isManagement(req.userRole)) return res.status(403).json({ message: "Insufficient permissions" });
  next();
}

export async function loadUser(req, _res, next) {
  if (!req.userId) return next();
  // Lean projection + avoid writing lastAccess on every /me (was a write per page load).
  const user = await User.findById(req.userId);
  if (!user) {
    req.user = null;
    return next();
  }
  req.user = user;
  const last = user.lastAccessAt ? new Date(user.lastAccessAt).getTime() : 0;
  if (Date.now() - last > 5 * 60_000) {
    user.lastAccessAt = new Date();
    await user.save().catch(() => {});
  }
  next();
}

export async function requireCenterAssigned(req, res, next) {
  if (isCeo(req.userRole)) return next();
  // Reuse if actor already loaded this request
  let user = req._actor;
  if (!user || String(user._id) !== String(req.userId)) {
    user = await User.findById(req.userId).select("_id centerId email role").lean();
    req._actor = user;
  }
  if (!user?.centerId) {
    return res.status(403).json({ message: "Center assignment required for this account" });
  }
  req.userCenterId = user.centerId;
  next();
}
