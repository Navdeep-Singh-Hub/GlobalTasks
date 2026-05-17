import mongoose from "mongoose";
import { User } from "../models/User.js";

function oid(v) {
  if (!v) return null;
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return null;
  }
}

async function getDirectChildrenMap(parentIds, centerId) {
  if (!parentIds.length) return [];
  const rows = await User.find({
    reportsTo: { $in: parentIds },
    ...(centerId ? { centerId } : {}),
  })
    .select("_id role centerId reportsTo")
    .lean();
  return rows;
}

/** Users an operations lead may assign tasks to (same center). */
export async function getOperationsAssignableIds(actorId, centerId) {
  if (!centerId) return [];
  const [mappedUsers, supervisors, therapists] = await Promise.all([
    User.find({ centerId, role: "user", active: true, reportsTo: actorId }).distinct("_id"),
    User.find({ centerId, role: "supervisor", active: true }).distinct("_id"),
    User.find({ centerId, role: "executor", executorKind: "therapist", active: true }).distinct("_id"),
  ]);
  return [...new Set([...mappedUsers, ...supervisors, ...therapists].map((id) => String(id)))];
}

export async function getDescendantUsers(rootUserId, centerId) {
  const root = oid(rootUserId);
  if (!root) return [];
  const seen = new Set([String(root)]);
  const queue = [root];
  const out = [];

  while (queue.length) {
    const batch = queue.splice(0, 100);
    const children = await getDirectChildrenMap(batch, centerId);
    for (const c of children) {
      const key = String(c._id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      queue.push(c._id);
    }
  }
  return out;
}

export async function getVisibleUserIds({ actorId, actorRole, centerId }) {
  if (actorRole === "ceo") return null;
  if (actorRole === "centre_head") {
    const ids = await User.find({ centerId }).distinct("_id");
    return ids.map(String);
  }
  if (actorRole === "coordinator") {
    const ids = await User.find({
      centerId,
      role: { $in: ["supervisor", "executor", "operations", "user"] },
      active: true,
    }).distinct("_id");
    return [String(actorId), ...ids.map(String)];
  }
  if (actorRole === "supervisor") {
    const descendants = await getDescendantUsers(actorId, centerId);
    return [String(actorId), ...descendants.map((u) => String(u._id))];
  }
  if (actorRole === "operations") {
    const ids = await getOperationsAssignableIds(actorId, centerId);
    return [String(actorId), ...ids];
  }
  return [String(actorId)];
}

export async function getAssignableAssigneeIds({ actorId, actorRole, centerId }) {
  if (actorRole === "executor" || actorRole === "user") return [];
  if (actorRole === "ceo") {
    const ids = await User.find({ role: { $ne: "ceo" }, active: true }).distinct("_id");
    return ids.map(String);
  }
  if (actorRole === "centre_head") {
    const ids = await User.find({
      centerId,
      role: { $in: ["coordinator", "supervisor", "operations", "user", "executor"] },
      active: true,
    }).distinct("_id");
    return ids.map(String);
  }
  if (actorRole === "coordinator") {
    const ids = await User.find({
      centerId,
      role: { $in: ["supervisor", "operations", "user", "executor"] },
      active: true,
    }).distinct("_id");
    return ids.map(String);
  }
  if (actorRole === "operations") {
    return getOperationsAssignableIds(actorId, centerId);
  }

  const descendants = await getDescendantUsers(actorId, centerId);
  const allowedRoles = new Set(["executor"]);
  return descendants.filter((u) => allowedRoles.has(u.role)).map((u) => String(u._id));
}

