import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    startDate: { type: Date, default: () => new Date() },
    endDate: { type: Date, default: null },
    status: { type: String, enum: ["planned", "active", "on_hold", "completed"], default: "active" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const Project = mongoose.model("Project", projectSchema);
