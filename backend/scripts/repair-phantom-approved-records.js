/**
 * Remove phantom approved rows (instant approve + duplicate prior-day remarks).
 * Run from backend folder: node scripts/repair-phantom-approved-records.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Task } from "../src/models/Task.js";
import { repairPhantomApprovedRecords } from "../src/services/taskApprovalHistory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI in backend/.env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const assigneeIds = await Task.distinct("assignees", { deletedAt: null, taskType: "daily" });
  let removed = 0;
  for (const assigneeId of assigneeIds) {
    const result = await repairPhantomApprovedRecords({ assigneeId });
    removed += result.removed || 0;
  }

  console.log(`Repair complete: removed ${removed} phantom approved record(s).`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
