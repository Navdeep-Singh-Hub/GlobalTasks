/**
 * Soft-delete duplicate open "Fill Daily Supervisor/Coordinator Sheet" tasks.
 * Keeps one per assignee+kind; marks remaining not-done copies as deleted.
 *
 * Usage: node scripts/cleanup-duplicate-daily-sheet-tasks.mjs
 * Dry run: node scripts/cleanup-duplicate-daily-sheet-tasks.mjs --dry-run
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Task } from "../src/models/Task.js";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tms";
const dryRun = process.argv.includes("--dry-run");

const SUPERVISOR_RE = /fill\s+daily\s+supervisor\s+sheet/i;
const COORDINATOR_RE = /fill\s+daily\s+coordinator\s+sheet/i;
const OPEN = ["pending", "in_progress", "overdue", "awaiting_approval"];

function sheetKind(title) {
  if (SUPERVISOR_RE.test(String(title || ""))) return "supervisor";
  if (COORDINATOR_RE.test(String(title || ""))) return "coordinator";
  return null;
}

function scoreKeep(task) {
  // Prefer already-submitted for approval, then later due / fresher updates.
  const awaitPts = task.status === "awaiting_approval" ? 1000 : 0;
  const duePts = new Date(task.dueDate || 0).getTime() / 1e10;
  const updPts = new Date(task.updatedAt || 0).getTime() / 1e12;
  return awaitPts + duePts + updPts;
}

async function run() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const openSheets = await Task.find({
    deletedAt: null,
    status: { $in: OPEN },
    $or: [{ title: SUPERVISOR_RE }, { title: COORDINATOR_RE }],
  })
    .select("_id title status dueDate updatedAt assignees createdAt")
    .lean();

  /** @type {Map<string, any[]>} */
  const groups = new Map();
  for (const t of openSheets) {
    const kind = sheetKind(t.title);
    if (!kind) continue;
    const assigneeIds = (t.assignees || []).map((id) => String(id)).filter(Boolean);
    if (!assigneeIds.length) {
      const key = `none:${kind}:${String(t._id)}`;
      groups.set(key, [t]);
      continue;
    }
    for (const aid of assigneeIds) {
      const key = `${aid}:${kind}`;
      const list = groups.get(key) || [];
      list.push(t);
      groups.set(key, list);
    }
  }

  const toDelete = new Set();
  const kept = [];
  const groupSummary = [];

  for (const [key, list] of groups) {
    // Dedupe same task id if multi-assignee (shouldn't happen for sheet tasks)
    const unique = [];
    const seen = new Set();
    for (const t of list) {
      const id = String(t._id);
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(t);
    }
    if (unique.length <= 1) {
      if (unique[0]) kept.push({ key, keepId: String(unique[0]._id), title: unique[0].title });
      continue;
    }
    unique.sort((a, b) => scoreKeep(b) - scoreKeep(a));
    const keep = unique[0];
    const drop = unique.slice(1);
    kept.push({ key, keepId: String(keep._id), title: keep.title, status: keep.status });
    for (const d of drop) toDelete.add(String(d._id));
    groupSummary.push({
      key,
      keep: { _id: String(keep._id), status: keep.status, dueDate: keep.dueDate },
      drop: drop.map((d) => ({ _id: String(d._id), status: d.status, dueDate: d.dueDate, title: d.title })),
    });
  }

  const deleteIds = [...toDelete];
  let deletedCount = 0;
  if (deleteIds.length && !dryRun) {
    const res = await Task.updateMany(
      { _id: { $in: deleteIds }, deletedAt: null },
      { $set: { deletedAt: new Date() } }
    );
    deletedCount = res.modifiedCount || 0;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        openSheetTasksScanned: openSheets.length,
        duplicateGroups: groupSummary.length,
        wouldDelete: deleteIds.length,
        deletedCount: dryRun ? 0 : deletedCount,
        groups: groupSummary,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
