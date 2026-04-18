import mongoose from "mongoose";

export const TASK_TYPES = ["one_time", "daily", "weekly", "fortnightly", "monthly", "quarterly", "yearly"];
export const TASK_STATUSES = ["pending", "in_progress", "awaiting_approval", "completed", "overdue", "cancelled"];
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];

const attachmentSchema = new mongoose.Schema(
  {
    name: String,
    url: String,
    size: Number,
    mimeType: String,
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    taskType: { type: String, enum: TASK_TYPES, default: "one_time" },
    status: { type: String, enum: TASK_STATUSES, default: "pending" },
    priority: { type: String, enum: TASK_PRIORITIES, default: "normal" },
    dueDate: { type: Date, required: true },

    recurrence: {
      endDate: { type: Date, default: null },
      forever: { type: Boolean, default: false },
      includeSunday: { type: Boolean, default: false },
      weekOff: { type: String, default: "Sunday" },
    },

    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    requiresApproval: { type: Boolean, default: false },
    approvalStatus: { type: String, enum: ["none", "pending", "approved", "rejected"], default: "none" },
    /** Last admin rejection (required when rejecting). */
    rejectionRemarks: { type: String, default: "" },
    rejectionMode: { type: String, default: "" },

    attachments: { type: [attachmentSchema], default: [] },
    voiceNoteUrl: { type: String, default: "" },

    tags: { type: [String], default: [] },

    deletedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ status: 1, taskType: 1, dueDate: 1 });

export const Task = mongoose.model("Task", taskSchema);
