import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    role: { type: String, enum: ["admin", "manager", "user"], default: "user" },
    department: { type: String, default: "" },
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
  },
  { timestamps: true }
);

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export const User = mongoose.model("User", userSchema);
