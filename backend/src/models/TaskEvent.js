import mongoose from "mongoose";

const taskEventSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    eventType: {
      type: String,
      enum: ["created", "updated", "assigned", "submitted", "approved", "rejected", "escalated", "completed", "deleted", "restored"],
      required: true,
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

taskEventSchema.index({ taskId: 1, createdAt: -1 });

export const TaskEvent = mongoose.model("TaskEvent", taskEventSchema);
