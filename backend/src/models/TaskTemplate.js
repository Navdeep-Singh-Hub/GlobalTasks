import mongoose from "mongoose";
import { TASK_PRIORITIES } from "./Task.js";

const taskTemplateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    functionTag: { type: String, required: true, trim: true },
    priorityDefault: { type: String, enum: TASK_PRIORITIES, default: "normal" },
    recurringTypeDefault: {
      type: String,
      enum: ["one_time", "daily", "weekly", "monthly", "custom"],
      default: "one_time",
    },
    requiredInputsSchema: { type: mongoose.Schema.Types.Mixed, default: { type: "object", properties: {}, required: [] } },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

taskTemplateSchema.index({ departmentId: 1, functionTag: 1, active: 1 });

export const TaskTemplate = mongoose.model("TaskTemplate", taskTemplateSchema);
