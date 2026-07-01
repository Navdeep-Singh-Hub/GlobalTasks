import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { assignerScopeClause } from "./taskApprovalHistory.js";
import { isCeo } from "../constants/roles.js";

/** May assign tasks in any center and to any center's staff (hardcoded). */
export const CROSS_CENTER_ASSIGNER_EMAILS = ["sachin@gmail.com"];

export function isCrossCenterAssignerEmail(email) {
  return CROSS_CENTER_ASSIGNER_EMAILS.includes(String(email || "").trim().toLowerCase());
}

export async function isCrossCenterAssigner(userId) {
  if (!userId) return false;
  const u = await User.findById(userId).select("email").lean();
  return isCrossCenterAssignerEmail(u?.email);
}

export function canAccessAnyCenter({ role, email }) {
  return isCeo(role) || isCrossCenterAssignerEmail(email);
}

/** Treat missing `active` as active (legacy users created before the field existed). */
export const ACTIVE_USER_FILTER = { $ne: false };

function centerScopeFilter(centerId) {
  if (!centerId) return {};
  const cid = oid(centerId);
  if (!cid) return {};
  return {
    $or: [{ centerId: cid }, { centerId: null }, { centerId: { $exists: false } }],
  };
}

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

/** Roles that can receive tasks within a center (excludes ceo / centre_head). */
const CENTER_ASSIGNEE_ROLES = ["coordinator", "supervisor", "operations", "user", "executor"];

/** Legacy users with no center still count as in-scope for a selected center. */
export function assigneeMatchesCenter(userCenterId, taskCenterId) {
  if (!taskCenterId) return true;
  if (userCenterId == null || userCenterId === "") return true;
  return String(userCenterId) === String(taskCenterId);
}

export async function findInvalidCenterAssignees(assigneeIds, taskCenterId) {
  if (!assigneeIds.length || !taskCenterId) return [];
  const users = await User.find({ _id: { $in: assigneeIds } })
    .select("_id centerId")
    .lean();
  return users.filter((u) => !assigneeMatchesCenter(u.centerId, taskCenterId)).map((u) => String(u._id));
}

/** Users an operations lead may assign tasks to (same center, any role except CEO). */
export async function getOperationsAssignableIds(_actorId, centerId) {
  if (!centerId) return [];
  const ids = await User.find({
    ...centerScopeFilter(centerId),
    role: { $ne: "ceo" },
    active: ACTIVE_USER_FILTER,
  }).distinct("_id");
  return ids.map(String);
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
      ...centerScopeFilter(centerId),
      role: { $in: ["coordinator", "supervisor", "executor", "operations", "user"] },
      active: ACTIVE_USER_FILTER,
    }).distinct("_id");
    return [String(actorId), ...ids.map(String)];
  }
  if (actorRole === "supervisor") {
    const descendants = await getDescendantUsers(actorId, centerId);
    return [String(actorId), ...descendants.map((u) => String(u._id))];
  }
  if (actorRole === "operations") {
    const filter = { deletedAt: null, ...assignerScopeClause(actorId) };
    if (centerId) Object.assign(filter, centerScopeFilter(centerId));
    const assigneeIds = await Task.distinct("assignees", filter);
    return [String(actorId), ...assigneeIds.map(String)];
  }
  return [String(actorId)];
}

export async function getAssignableAssigneeIds({ actorId, actorRole, centerId, actorEmail }) {
  if (actorRole === "executor" || actorRole === "user") return [];
  const crossCenter = actorEmail ? isCrossCenterAssignerEmail(actorEmail) : await isCrossCenterAssigner(actorId);
  if (actorRole === "ceo" || crossCenter) {
    const filter = { role: { $ne: "ceo" }, active: ACTIVE_USER_FILTER };
    if (centerId) Object.assign(filter, centerScopeFilter(centerId));
    const ids = await User.find(filter).distinct("_id");
    return ids.map(String);
  }
  if (actorRole === "centre_head") {
    const ids = await User.find({
      ...centerScopeFilter(centerId),
      role: { $in: CENTER_ASSIGNEE_ROLES },
      active: ACTIVE_USER_FILTER,
    }).distinct("_id");
    return ids.map(String);
  }
  if (actorRole === "coordinator") {
    const ids = await User.find({
      ...centerScopeFilter(centerId),
      role: { $in: CENTER_ASSIGNEE_ROLES },
      active: ACTIVE_USER_FILTER,
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

