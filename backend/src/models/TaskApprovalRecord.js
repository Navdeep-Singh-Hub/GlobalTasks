import mongoose from "mongoose";

/** Immutable log of each submit / approve / reject / not-done occurrence (incl. recurring). */
const taskApprovalRecordSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    taskTitle: { type: String, default: "" },
    taskType: { type: String, default: "one_time" },
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: "Center", default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    /** Due date for this occurrence at time of submit. */
    occurrenceDueDate: { type: Date, required: true },
    submittedAt: { type: Date, required: true },
    submissionRemarks: { type: String, default: "" },
    kind: { type: String, enum: ["completion", "not_done"], default: "completion" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "not_done_acknowledged", "missed"],
      default: "pending",
    },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectionRemarks: { type: String, default: "" },
    rejectionMode: { type: String, default: "" },
    /** assignee = voluntary submit; assigner_reopen = send back to For Approval */
    submissionSource: { type: String, enum: ["assignee", "assigner_reopen"], default: "assignee" },
  },
  { timestamps: true }
);

taskApprovalRecordSchema.index({ assignedBy: 1, assigneeId: 1, submittedAt: -1 });
taskApprovalRecordSchema.index({ taskId: 1, occurrenceDueDate: 1, submittedAt: -1 });
taskApprovalRecordSchema.index({ assigneeId: 1, status: 1, submittedAt: -1 });

export const TaskApprovalRecord = mongoose.model("TaskApprovalRecord", taskApprovalRecordSchema);
