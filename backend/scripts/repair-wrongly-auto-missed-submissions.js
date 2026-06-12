/**
 * Restore tasks/rows wrongly marked not done after submit-for-approval + date change.
 * Run from backend folder: node scripts/repair-wrongly-auto-missed-submissions.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Task } from "../src/models/Task.js";
import { repairWronglyAutoMissedSubmissions } from "../src/services/taskApprovalHistory.js";

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
    taskType: { $in: ["daily", "weekly", "fortnightly", "monthly", "quarterly", "yearly", "one_time"] },
  });

  let restoredRecords = 0;
  let restoredTasks = 0;
  let skipped = 0;

  for (const assigneeId of assigneeIds) {
    const result = await repairWronglyAutoMissedSubmissions({ assigneeId });
    restoredRecords += result.restoredRecords || 0;
    restoredTasks += result.restoredTasks || 0;
    skipped += result.skipped || 0;
  }

  console.log(
    `Restored ${restoredRecords} history row(s) and ${restoredTasks} task(s) back to waiting for approval (${skipped} skipped).`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
