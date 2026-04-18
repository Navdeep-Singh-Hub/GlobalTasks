import { Task } from "../models/Task.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Permanently remove tasks that have been in the recycle bin (soft-deleted) longer than the retention period.
 */
export async function purgeExpiredTrash() {
  const days = Math.max(1, Number(process.env.RECYCLE_BIN_RETENTION_DAYS) || 10);
  const cutoff = new Date(Date.now() - days * DAY_MS);
  const res = await Task.deleteMany({
    deletedAt: { $ne: null, $lte: cutoff },
  });
  if (res.deletedCount > 0) {
    console.log(`[purge] Permanently removed ${res.deletedCount} task(s) from recycle bin (deleted before ${cutoff.toISOString()}, retention ${days}d).`);
  }
  return res.deletedCount;
}

/**
 * Run purge once at startup, then on a fixed interval (default: every 24 hours).
 */
export function startTrashPurgeScheduler() {
  const intervalMs = Math.max(3_600_000, Number(process.env.RECYCLE_BIN_PURGE_INTERVAL_MS) || 24 * 3_600_000);

  void purgeExpiredTrash().catch((e) => console.error("[purge] Startup run failed:", e));

  setInterval(() => {
    purgeExpiredTrash().catch((e) => console.error("[purge] Scheduled run failed:", e));
  }, intervalMs);

  console.log(`[purge] Recycle bin auto-purge: retention ${Number(process.env.RECYCLE_BIN_RETENTION_DAYS) || 10}d, interval ${Math.round(intervalMs / 3600000)}h`);
}
