import { User } from "../models/User.js";

/**
 * For tasks assigned to `user` role staff, approvals go to their operations lead (reportsTo).
 * Returns null when assignees are not user-role or no valid operations lead exists.
 */
export async function resolveOperationsLeadApproverId(assigneeIds, centerId) {
  const ids = (assigneeIds || []).map((id) => String(id)).filter(Boolean);
  if (!ids.length) return null;

  const assignees = await User.find({ _id: { $in: ids }, active: true })
    .select("_id role reportsTo centerId")
    .lean();
  const userAssignees = assignees.filter((u) => u.role === "user");
  if (!userAssignees.length) return null;

  const leadIds = [
    ...new Set(
      userAssignees
        .map((u) => String(u.reportsTo || ""))
        .filter(Boolean)
    ),
  ];
  if (!leadIds.length) return null;

  const scopeCenter = centerId ? String(centerId) : null;
  const leads = await User.find({
    _id: { $in: leadIds },
    role: "operations",
    active: true,
    ...(scopeCenter ? { centerId: scopeCenter } : {}),
  })
    .select("_id centerId")
    .lean();

  if (!leads.length) return null;
  if (leads.length === 1) return String(leads[0]._id);

  // Multiple user assignees mapped to different operations leads — use first valid lead.
  for (const u of userAssignees) {
    const match = leads.find((l) => String(l._id) === String(u.reportsTo));
    if (match) return String(match._id);
  }
  return String(leads[0]._id);
}

/** IDs of user-role assignees mapped to this operations lead. */
export async function userAssigneeIdsForOperationsLead(operationsLeadId, centerId) {
  return User.find({
    role: "user",
    active: true,
    reportsTo: operationsLeadId,
    ...(centerId ? { centerId } : {}),
  }).distinct("_id");
}

export async function canApproveTaskForUser({ userId, userRole, task }) {
  if (!task) return false;
  if (userRole === "ceo") return true;
  if (String(task.createdBy || "") === String(userId || "")) return true;
  if (userRole === "operations" && task.assignees?.length) {
    const count = await User.countDocuments({
      _id: { $in: task.assignees },
      role: "user",
      reportsTo: userId,
      active: true,
    });
    if (count > 0) return true;
  }
  return false;
}
