/**
 * Remove phantom For Approval rows: awaiting_approval without a valid pending record,
 * stale approvalStatus pending on pending tasks, and misdated pending records.
 * Run from backend folder: node scripts/repair-phantom-for-approval.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Task } from "../src/models/Task.js";
import { TaskApprovalRecord } from "../src/models/TaskApprovalRecord.js";
import { repairAndFilterApprovalInboxTasks } from "../src/services/taskApprovalHistory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI in backend/.env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const candidates = await Task.find({
    deletedAt: null,
    $or: [
      { status: "awaiting_approval", approvalStatus: "pending" },
      { approvalStatus: "pending", status: { $ne: "awaiting_approval" } },
    ],
  }).select("_id title status approvalStatus");

  const kept = await repairAndFilterApprovalInboxTasks(candidates);
  const orphanPending = await TaskApprovalRecord.deleteMany({
    status: "pending",
    kind: "completion",
    taskId: {
      $nin: await Task.distinct("_id", {
        deletedAt: null,
        status: "awaiting_approval",
        approvalStatus: "pending",
      }),
    },
  });

  console.log(
    `Repair complete: checked ${candidates.length} task(s), ${kept.length} valid For Approval row(s), removed ${orphanPending.deletedCount} orphan pending record(s).`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
