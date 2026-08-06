import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { Department } from "../models/Department.js";
import { ALLOWED_DEPARTMENTS } from "../constants/departments.js";
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

/**
 * Expand free-text / primary dept into match keys (slug, code, name).
 * e.g. "speech" → speech, spe, Speech (lowercased).
 */
export function expandDepartmentMatchKeys(departmentText, deptDoc) {
  const keys = new Set();
  const add = (v) => {
    const s = String(v || "")
      .trim()
      .toLowerCase();
    if (s) keys.add(s);
  };
  add(departmentText);
  if (deptDoc) {
    add(deptDoc.name);
    add(deptDoc.code);
  }

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const d of ALLOWED_DEPARTMENTS) {
      const cands = [d.slug, String(d.code).toLowerCase(), String(d.name).toLowerCase()];
      if ([...keys].some((k) => cands.includes(k))) {
        for (const c of cands) {
          if (!keys.has(c)) {
            keys.add(c);
            expanded = true;
          }
        }
      }
    }
  }
  return [...keys];
}

/**
 * All therapists in the supervisor's center who share the same department
 * (Speech → all speech therapists, OT → all OT, BT → all BT, etc.).
 * Matches both free-text `department` and `departmentPrimary`.
 */
export async function getSupervisorDepartmentTherapistIds(supervisorId, centerId) {
  const supervisor = await User.findById(supervisorId).select("centerId department departmentPrimary").lean();
  if (!supervisor) return [];

  const center = centerId || supervisor.centerId || null;
  let deptDoc = null;
  if (supervisor.departmentPrimary) {
    deptDoc = await Department.findById(supervisor.departmentPrimary).select("name code").lean();
  }
  const keys = expandDepartmentMatchKeys(supervisor.department, deptDoc);
  if (!keys.length && !supervisor.departmentPrimary) return [];

  const or = [];
  if (supervisor.departmentPrimary) {
    or.push({ departmentPrimary: supervisor.departmentPrimary });
  }
  if (keys.length) {
    or.push({
      $expr: {
        $in: [{ $toLower: { $ifNull: ["$department", ""] } }, keys],
      },
    });
    // Therapists who only have departmentPrimary set (no free-text department).
    const upperCodes = keys.map((k) => k.toUpperCase());
    const nameRegexes = keys.map((k) => new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));
    const linkedDeptIds = await Department.find({
      $or: [{ code: { $in: upperCodes } }, { name: { $in: nameRegexes } }],
    }).distinct("_id");
    if (linkedDeptIds.length) {
      or.push({ departmentPrimary: { $in: linkedDeptIds } });
    }
  }
  if (!or.length) return [];

  const filter = {
    role: "executor",
    executorKind: "therapist",
    active: ACTIVE_USER_FILTER,
    $or: or,
  };
  if (center) filter.centerId = oid(center) || center;

  const ids = await User.find(filter).distinct("_id");
  return ids.map(String);
}

/**
 * Therapists a supervisor may view/manage clinically:
 * 1) Same department + center (primary rule)
 * 2) Plus hierarchy fallbacks so mapped reports still appear
 */
export async function getSupervisorTherapistIds(supervisorId, centerId) {
  const deptIds = await getSupervisorDepartmentTherapistIds(supervisorId, centerId);

  const descendants = await getDescendantUsers(supervisorId, centerId || null);
  const descendantIds = descendants.filter((u) => u.role === "executor").map((u) => String(u._id));

  const directReportIds = await User.distinct("_id", {
    reportsTo: supervisorId,
    role: "executor",
    executorKind: "therapist",
    active: ACTIVE_USER_FILTER,
    ...(centerId ? { centerId } : {}),
  });

  const candidateIds = Array.from(
    new Set([...deptIds, ...descendantIds, ...directReportIds.map((id) => String(id))])
  );
  if (!candidateIds.length) return [];

  const therapistIds = await User.find({
    _id: { $in: candidateIds },
    role: "executor",
    executorKind: "therapist",
    active: ACTIVE_USER_FILTER,
    ...(centerId ? { centerId } : {}),
  }).distinct("_id");
  return therapistIds;
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
    const deptTherapists = await getSupervisorDepartmentTherapistIds(actorId, centerId);
    return Array.from(
      new Set([String(actorId), ...descendants.map((u) => String(u._id)), ...deptTherapists])
    );
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

  // Supervisors: all therapists in their department (Speech/OT/BT/…) + direct reports.
  if (actorRole === "supervisor") {
    const [descendants, deptTherapists] = await Promise.all([
      getDescendantUsers(actorId, centerId),
      getSupervisorDepartmentTherapistIds(actorId, centerId),
    ]);
    const fromTree = descendants.filter((u) => u.role === "executor").map((u) => String(u._id));
    return Array.from(new Set([...fromTree, ...deptTherapists]));
  }

  const descendants = await getDescendantUsers(actorId, centerId);
  const allowedRoles = new Set(["executor"]);
  return descendants.filter((u) => allowedRoles.has(u.role)).map((u) => String(u._id));
}
