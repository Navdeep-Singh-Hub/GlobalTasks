/**
 * Rebuild TaskApprovalRecord rows from TaskEvent (submit → approve/reject).
 * Run after backfill-task-assigned-by.js. From backend folder:
 *   node scripts/backfill-task-approval-history.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { backfillApprovalRecordsFromEvents } from "../src/services/taskApprovalHistory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Set MONGODB_URI in backend/.env");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const result = await backfillApprovalRecordsFromEvents();
  console.log(`Approval history backfill: created ${result.created}, skipped ${result.skipped}.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
