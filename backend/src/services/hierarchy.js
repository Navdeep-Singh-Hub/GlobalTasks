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
      role: { $in: ["supervisor", "executor"] },
      active: true,
    }).distinct("_id");
    return [String(actorId), ...ids.map(String)];
  }
  if (actorRole === "supervisor") {
    const descendants = await getDescendantUsers(actorId, centerId);
    return [String(actorId), ...descendants.map((u) => String(u._id))];
  }
  return [String(actorId)];
}

export async function getAssignableAssigneeIds({ actorId, actorRole, centerId }) {
  if (actorRole === "executor") return [];
  if (actorRole === "ceo") {
    const ids = await User.find({ role: { $ne: "ceo" }, active: true }).distinct("_id");
    return ids.map(String);
  }
  if (actorRole === "centre_head") {
    const ids = await User.find({
      centerId,
      role: { $in: ["coordinator", "supervisor", "executor"] },
      active: true,
    }).distinct("_id");
    return ids.map(String);
  }
  if (actorRole === "coordinator") {
    const ids = await User.find({
      centerId,
      role: { $in: ["supervisor", "executor"] },
      active: true,
    }).distinct("_id");
    return ids.map(String);
  }

  const descendants = await getDescendantUsers(actorId, centerId);
  const allowedRoles = new Set(["executor"]);
  return descendants.filter((u) => allowedRoles.has(u.role)).map((u) => String(u._id));
}

