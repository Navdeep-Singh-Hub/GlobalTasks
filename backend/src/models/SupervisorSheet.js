import mongoose from "mongoose";

const supervisorSheetEntrySchema = new mongoose.Schema(
  {
    taskKey: { type: String, required: true, trim: true },
    status: { type: String, enum: ["yes", "no"], default: "no" },
    remarks: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const supervisorSheetSchema = new mongoose.Schema(
  {
    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: "Center", required: true },
    sheetDate: { type: String, required: true }, // YYYY-MM-DD
    entries: { type: [supervisorSheetEntrySchema], default: [] },
  },
  { timestamps: true }
);

supervisorSheetSchema.index({ supervisorId: 1, sheetDate: 1 }, { unique: true });
supervisorSheetSchema.index({ centerId: 1, sheetDate: -1 });

export const SupervisorSheet = mongoose.model("SupervisorSheet", supervisorSheetSchema);
