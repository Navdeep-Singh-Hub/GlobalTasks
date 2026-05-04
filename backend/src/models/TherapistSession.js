import mongoose from "mongoose";

const therapistSessionSchema = new mongoose.Schema(
  {
    therapistId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: "Center", required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
    sessionDate: { type: String, required: true }, // YYYY-MM-DD
    patientName: { type: String, required: true, trim: true },
    patientCode: { type: String, default: "", trim: true },
    startedAt: { type: String, default: "" }, // HH:mm
    endedAt: { type: String, default: "" }, // HH:mm
    durationMinutes: { type: Number, default: 0, min: 0 },
    /** Therapist confirms they uploaded session video (may be outside this form). */
    videoUploaded: { type: Boolean, default: false },
    videoUrl: { type: String, default: "" },
    attendanceMarked: { type: Boolean, default: true },
    planUpdated15d: { type: Boolean, default: false },
    newActivity15d: { type: Boolean, default: false },
    newActivityText: { type: String, default: "", trim: true },
    monthlyTestDone: { type: Boolean, default: false },
    monthlyTestNotes: { type: String, default: "", trim: true },
    /** Free-text notes from the therapist when logging the session (distinct from supervisor remarks). */
    remarks: { type: String, default: "", trim: true, maxlength: 2000 },
    supervisorScore: { type: Number, default: 0, min: 0, max: 5 },
    supervisorRemarks: { type: String, default: "", trim: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    markedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

therapistSessionSchema.index({ therapistId: 1, sessionDate: -1 });
therapistSessionSchema.index({ centerId: 1, sessionDate: -1 });
therapistSessionSchema.index({ centerId: 1, therapistId: 1, sessionDate: -1 });
therapistSessionSchema.index({ centerId: 1, createdAt: -1 });
therapistSessionSchema.index({ sessionDate: -1 });

export const TherapistSession = mongoose.model("TherapistSession", therapistSessionSchema);
