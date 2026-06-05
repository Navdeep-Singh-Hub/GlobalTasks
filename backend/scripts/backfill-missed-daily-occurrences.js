/**
 * Backfill missed daily occurrence rows for all assignees (run once after deploy).
 * From backend folder: node scripts/backfill-missed-daily-occurrences.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Task } from "../src/models/Task.js";
import { syncRecurringTasksForAssignee } from "../src/services/recurringOccurrenceSync.js";

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
    taskType: "daily",
  });

  let totalMissed = 0;
  let synced = 0;
  for (const assigneeId of assigneeIds) {
    // eslint-disable-next-line no-await-in-loop
    const result = await syncRecurringTasksForAssignee(assigneeId);
    synced += result.synced || 0;
    totalMissed += result.totalMissed || 0;
  }

  console.log(
    `Backfill complete: synced ${synced} task(s) across ${assigneeIds.length} assignee(s); ${totalMissed} missed occurrence(s) recorded.`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
