/**
 * Remove/fix missed records dated today (day not ended), wrong occurrence days, and assignee remarks on auto-missed rows.
 * Run from backend folder: node scripts/repair-misdated-missed-records.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Task } from "../src/models/Task.js";
import { repairMisdatedMissedRecords } from "../src/services/taskApprovalHistory.js";

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
  let fixed = 0;
  let removed = 0;
  for (const assigneeId of assigneeIds) {
    const result = await repairMisdatedMissedRecords({ assigneeId });
    fixed += result.fixed || 0;
    removed += result.removed || 0;
  }

  console.log(`Repair complete: ${fixed} record(s) fixed, ${removed} erroneous missed row(s) removed.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
