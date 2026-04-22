import mongoose from "mongoose";

const escalationSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    level: { type: String, enum: ["supervisor", "coordinator", "centre_head", "ceo"], required: true },
    triggerReason: { type: String, enum: ["overdue", "repeated_delay", "non_reporting"], default: "overdue" },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    notifiedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

escalationSchema.index({ taskId: 1, level: 1, status: 1 });
escalationSchema.index({ status: 1, createdAt: -1 });

export const Escalation = mongoose.model("Escalation", escalationSchema);
