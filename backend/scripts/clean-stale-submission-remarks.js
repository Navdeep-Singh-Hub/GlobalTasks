/**
 * Clear submissionRemarks on tasks that are back in pending work (not awaiting approval).
 * Run from backend folder: node scripts/clean-stale-submission-remarks.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Task } from "../src/models/Task.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI in backend/.env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const result = await Task.updateMany(
    {
      deletedAt: null,
      status: { $in: ["pending", "in_progress", "overdue"] },
      approvalStatus: { $ne: "pending" },
      submissionRemarks: { $nin: ["", null] },
    },
    { $set: { submissionRemarks: "" } }
  );

  console.log(`Cleared stale submissionRemarks on ${result.modifiedCount} task(s).`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
