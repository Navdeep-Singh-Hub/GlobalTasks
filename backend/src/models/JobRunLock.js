import mongoose from "mongoose";

const jobRunLockSchema = new mongoose.Schema(
  {
    job: { type: String, required: true },
    runType: { type: String, required: true },
    dateKey: { type: String, required: true }, // YYYY-MM-DD in job timezone
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

jobRunLockSchema.index({ job: 1, runType: 1, dateKey: 1 }, { unique: true });

export const JobRunLock = mongoose.model("JobRunLock", jobRunLockSchema);

