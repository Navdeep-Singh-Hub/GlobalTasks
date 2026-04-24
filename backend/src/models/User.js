import mongoose from "mongoose";
import { USER_ROLES, EXECUTOR_KINDS } from "../constants/roles.js";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    role: { type: String, enum: USER_ROLES, default: "executor" },
    executorKind: { type: String, enum: EXECUTOR_KINDS, default: "" },
    department: { type: String, default: "" },
    departmentPrimary: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: "Center", default: null },
    reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    permissions: {
      type: [String],
      default: ["view_tasks"],
    },
    active: { type: Boolean, default: true },
    deactivatedAt: { type: Date, default: null },
    deactivatedReason: { type: String, default: "" },
    lastAccessAt: { type: Date, default: null },
    avatarUrl: { type: String, default: "" },
    title: { type: String, default: "" },
    weekOffDays: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.every((d) =>
            ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].includes(String(d || "").toLowerCase())
          ),
        message: "Invalid week off days",
      },
    },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, active: 1 });
userSchema.index({ centerId: 1, role: 1 });
userSchema.index({ reportsTo: 1 });

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export const User = mongoose.model("User", userSchema);
