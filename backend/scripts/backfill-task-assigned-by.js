/**
 * Fix task ownership: set assignedBy from the user who actually created each task (TaskEvent).
 * Run from backend folder: node scripts/backfill-task-assigned-by.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Task } from "../src/models/Task.js";
import { TaskEvent } from "../src/models/TaskEvent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI in backend/.env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const createdEvents = await TaskEvent.find({ eventType: "created" }).select("taskId actorId").lean();
  const actorByTask = new Map(createdEvents.map((e) => [String(e.taskId), String(e.actorId)]));

  const tasks = await Task.find({ deletedAt: null }).select("_id createdBy assignedBy").lean();
  let updated = 0;
  for (const t of tasks) {
    const fromEvent = actorByTask.get(String(t._id));
    const assigner = fromEvent || String(t.createdBy || "");
    if (!assigner) continue;
    const current = String(t.assignedBy || "");
    if (current === assigner) continue;
    await Task.updateOne({ _id: t._id }, { $set: { assignedBy: assigner } });
    updated += 1;
  }

  console.log(`Backfill complete: updated assignedBy on ${updated} of ${tasks.length} tasks.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
