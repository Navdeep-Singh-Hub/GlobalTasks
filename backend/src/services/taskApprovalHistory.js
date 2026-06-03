import { TaskApprovalRecord } from "../models/TaskApprovalRecord.js";
import { Task } from "../models/Task.js";

export function taskAssignerIdFromDoc(task) {
  return String(task?.assignedBy?._id || task?.assignedBy || task?.createdBy?._id || task?.createdBy || "");
}

export async function recordTaskSubmission({ task, assigneeId, remarks, kind = "completion" }) {
  const assignedBy = taskAssignerIdFromDoc(task);
  if (!assignedBy || !assigneeId) return null;
  return TaskApprovalRecord.create({
    taskId: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    centerId: task.centerId || null,
    assignedBy,
    assigneeId,
    occurrenceDueDate: task.dueDate,
    submittedAt: new Date(),
    submissionRemarks: String(remarks || "").trim(),
    kind,
    status: "pending",
  });
}

export async function finalizeApprovalRecord({ task, occurrenceDueDate, approverId, status, extra = {} }) {
  const due = occurrenceDueDate || task.dueDate;
  const update = {
    status,
    ...extra,
  };
  if (status === "approved") {
    update.approvedAt = extra.approvedAt || new Date();
    update.approvedBy = approverId;
  }
  if (status === "rejected") {
    update.rejectedAt = extra.rejectedAt || new Date();
    update.rejectedBy = approverId;
  }
  if (status === "not_done_acknowledged") {
    update.approvedAt = extra.approvedAt || new Date();
    update.approvedBy = approverId;
  }

  const record = await TaskApprovalRecord.findOneAndUpdate(
    {
      taskId: task._id,
      occurrenceDueDate: due,
      status: "pending",
    },
    { $set: update },
    { sort: { submittedAt: -1 }, new: true }
  );

  if (record) return record;

  return TaskApprovalRecord.create({
    taskId: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    centerId: task.centerId || null,
    assignedBy: taskAssignerIdFromDoc(task),
    assigneeId: (task.assignees || [])[0] || null,
    occurrenceDueDate: due,
    submittedAt: extra.submittedAt || task.updatedAt || new Date(),
    submissionRemarks: task.submissionRemarks || "",
    kind: extra.kind || "completion",
    status,
    approvedAt: update.approvedAt || null,
    approvedBy: update.approvedBy || null,
    rejectedAt: update.rejectedAt || null,
    rejectedBy: update.rejectedBy || null,
    rejectionRemarks: extra.rejectionRemarks || "",
    rejectionMode: extra.rejectionMode || "",
  });
}

export async function recordNotDoneSubmission({ task, assigneeId, remarks, occurrenceDueDate }) {
  const assignedBy = taskAssignerIdFromDoc(task);
  if (!assignedBy || !assigneeId) return null;
  return TaskApprovalRecord.create({
    taskId: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    centerId: task.centerId || null,
    assignedBy,
    assigneeId,
    occurrenceDueDate: occurrenceDueDate || task.dueDate,
    submittedAt: new Date(),
    submissionRemarks: String(remarks || "").trim(),
    kind: "not_done",
    status: "pending",
  });
}

export function assignerScopeClause(userId) {
  return {
    $or: [
      { assignedBy: userId },
      { assignedBy: null, createdBy: userId },
      { assignedBy: { $exists: false }, createdBy: userId },
    ],
  };
}

export async function listMyAssignees({ userId, centerId, isCeoRole }) {
  const taskFilter = { deletedAt: null, ...assignerScopeClause(userId) };
  if (!isCeoRole && centerId) taskFilter.centerId = centerId;

  const assigneeIds = await Task.distinct("assignees", taskFilter);
  return assigneeIds.map(String).filter(Boolean);
}
