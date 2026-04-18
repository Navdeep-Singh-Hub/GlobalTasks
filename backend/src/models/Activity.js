import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorName: { type: String, default: "" },
    type: { type: String, required: true },
    message: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
    taskTitle: { type: String, default: "" },
    taskType: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Activity = mongoose.model("Activity", activitySchema);
