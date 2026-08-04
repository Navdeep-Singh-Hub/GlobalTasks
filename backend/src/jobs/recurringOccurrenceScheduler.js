import { syncAllAssigneesRecurringOccurrences } from "../services/recurringOccurrenceSync.js";

const HOUR_MS = 3600_000;
const DEFAULT_INTERVAL_MS = 30 * 60_000;

export async function runRecurringOccurrenceSync() {
  return syncAllAssigneesRecurringOccurrences();
}

export function startRecurringOccurrenceScheduler() {
  const intervalMs = Math.max(
    5 * 60_000,
    Number(process.env.RECURRING_SYNC_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  );
  // Defer full-org sync so login/dashboard are not competing at boot.
  setTimeout(() => {
    void runRecurringOccurrenceSync().catch((e) =>
      console.error("[recurring-sync] Startup sync failed:", e)
    );
  }, 90_000);
  setInterval(() => {
    runRecurringOccurrenceSync().catch((e) =>
      console.error("[recurring-sync] Scheduled sync failed:", e)
    );
  }, intervalMs);
  console.log(
    `[recurring-sync] Scheduler started for all assignees (every ${Math.round(intervalMs / 60_000)} min, first run in 90s)`
  );
}
