/** In-memory TTL gates so hot list endpoints don't repeat heavy sync/repair per request. */

const DEFAULT_TTL_MS = Math.max(60_000, Number(process.env.ASSIGNEE_SYNC_TTL_MS) || 15 * 60_000);
const REPAIR_TTL_MS = Math.max(60_000, Number(process.env.ASSIGNEE_REPAIR_TTL_MS) || 60 * 60_000);

const lastRun = new Map();

export function throttleKey(...parts) {
  return parts.filter(Boolean).join(":");
}

export function shouldRunThrottled(key, ttlMs = DEFAULT_TTL_MS) {
  const now = Date.now();
  const last = lastRun.get(key) || 0;
  if (now - last < ttlMs) return false;
  lastRun.set(key, now);
  return true;
}

export function invalidateThrottle(key) {
  lastRun.delete(key);
}

export function invalidateAssigneeSync(assigneeId) {
  const id = String(assigneeId || "");
  if (!id) return;
  invalidateThrottle(throttleKey("recurring-sync", id));
  invalidateThrottle(throttleKey("inbox-repair", id));
  invalidateThrottle(throttleKey("history-repair", id));
}

export function scheduleBackground(key, fn, ttlMs = DEFAULT_TTL_MS) {
  if (!shouldRunThrottled(key, ttlMs)) return;
  void Promise.resolve()
    .then(fn)
    .catch((e) => console.error(`[sync-throttle] ${key} failed:`, e?.message || e));
}

export { DEFAULT_TTL_MS, REPAIR_TTL_MS };
