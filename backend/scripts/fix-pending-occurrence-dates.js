/**
 * Fix pending approval rows stamped with tomorrow's due date after send-back on recurring tasks.
 * Run from backend folder: node scripts/fix-pending-occurrence-dates.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { TaskApprovalRecord } from "../src/models/TaskApprovalRecord.js";
import { APP_TIMEZONE, calendarDayKeyInTz } from "../src/utils/recurrence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function occurrenceDueOnDay(dueDate, dayKey) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(dueDate));
  return new Date(`${dayKey}T${time}+05:30`);
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI in backend/.env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const pending = await TaskApprovalRecord.find({ status: "pending", kind: "completion" }).lean();
  let fixed = 0;
  let deleted = 0;

  for (const row of pending) {
    const subKey = calendarDayKeyInTz(row.submittedAt);
    const dueKey = calendarDayKeyInTz(row.occurrenceDueDate);
    if (!subKey || !dueKey || dueKey <= subKey) continue;

    const corrected = occurrenceDueOnDay(row.occurrenceDueDate, subKey);
    const dayStart = new Date(`${subKey}T00:00:00+05:30`);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dup = await TaskApprovalRecord.findOne({
      _id: { $ne: row._id },
      taskId: row.taskId,
      status: "pending",
      occurrenceDueDate: { $gte: dayStart, $lt: dayEnd },
    }).lean();

    if (dup) {
      await TaskApprovalRecord.deleteOne({ _id: row._id });
      deleted += 1;
      continue;
    }

    await TaskApprovalRecord.updateOne({ _id: row._id }, { $set: { occurrenceDueDate: corrected } });
    fixed += 1;
  }

  console.log(`Done: corrected ${fixed}, removed ${deleted} duplicate pending row(s).`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
