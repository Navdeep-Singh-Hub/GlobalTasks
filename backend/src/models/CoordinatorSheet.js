import mongoose from "mongoose";

const coordinatorSheetEntrySchema = new mongoose.Schema(
  {
    taskKey: { type: String, required: true, trim: true },
    status: { type: String, enum: ["yes", "no"], default: "no" },
    remarks: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const coordinatorSheetSchema = new mongoose.Schema(
  {
    coordinatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: "Center", required: true },
    sheetDate: { type: String, required: true },
    entries: { type: [coordinatorSheetEntrySchema], default: [] },
  },
  { timestamps: true }
);

coordinatorSheetSchema.index({ coordinatorId: 1, sheetDate: 1 }, { unique: true });
coordinatorSheetSchema.index({ centerId: 1, sheetDate: -1 });

export const CoordinatorSheet = mongoose.model("CoordinatorSheet", coordinatorSheetSchema);
