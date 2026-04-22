import mongoose from "mongoose";

const centerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

centerSchema.index({ code: 1 }, { unique: true });
centerSchema.index({ name: 1 }, { unique: true });

export const Center = mongoose.model("Center", centerSchema);
