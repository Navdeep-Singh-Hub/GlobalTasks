/**
 * Repair approval history for every assignee (all centres).
 * Run from backend folder: node scripts/repair-all-assignee-history.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Task } from "../src/models/Task.js";
import { repairAssigneeHistoryRecords } from "../src/services/taskApprovalHistory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI in backend/.env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const assigneeIds = await Task.distinct("assignees", {
    deletedAt: null,
    taskType: { $in: ["daily", "weekly", "fortnightly", "monthly", "quarterly", "yearly"] },
  });
  let totals = { fixed: 0, removed: 0, notDoneConflicts: 0 };

  for (const assigneeId of assigneeIds) {
    const result = await repairAssigneeHistoryRecords({ assigneeId });
    totals.fixed += result.misdatedApproved?.fixed || 0;
    totals.removed +=
      (result.misdatedApproved?.removed || 0) +
      (result.phantoms?.removed || 0) +
      (result.missed?.removed || 0);
    totals.notDoneConflicts += result.notDoneConflicts?.removed || 0;
  }

  console.log(
    `Repair complete for ${assigneeIds.length} assignee(s): ${totals.fixed} occurrence date(s) fixed, ${totals.removed} bad row(s) removed, ${totals.notDoneConflicts} auto-missed conflict(s) cleared.`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
