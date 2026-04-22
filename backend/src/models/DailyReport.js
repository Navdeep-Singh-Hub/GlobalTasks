import mongoose from "mongoose";

const dailyReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: "Center", default: null },
    reportDate: { type: String, required: true }, // YYYY-MM-DD
    departmentsWorked: [{ type: mongoose.Schema.Types.ObjectId, ref: "Department" }],
    completedTaskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    pendingTaskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    issues: { type: [String], default: [] },
    completionPercent: { type: Number, default: 0 },
    submittedAt: { type: Date, default: () => new Date() },
    source: { type: String, enum: ["app", "whatsapp_link"], default: "app" },
  },
  { timestamps: true }
);

dailyReportSchema.index({ userId: 1, reportDate: 1 }, { unique: true });
dailyReportSchema.index({ reportDate: 1 });
dailyReportSchema.index({ centerId: 1, reportDate: 1 });

export const DailyReport = mongoose.model("DailyReport", dailyReportSchema);
