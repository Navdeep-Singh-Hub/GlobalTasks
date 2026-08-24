import { JobRunLock } from "../models/JobRunLock.js";
import { User } from "../models/User.js";
import {
  autoSubmitDueTasksForUser,
  AUTO_SUBMIT_ASSIGNEE_EMAILS,
} from "../services/autoSubmitDueTasks.js";

const JOB = "auto_submit_due_tasks";
const TZ = "Asia/Kolkata";
const SUBMIT_AT = "17:30";

function zonedParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return map;
}

function dateKeyInTz(d = new Date()) {
  const p = zonedParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

function hhmmInTz(d = new Date()) {
  const p = zonedParts(d);
  return `${p.hour}:${p.minute}`;
}

function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function shouldRunNow(current, target) {
  return hhmmToMinutes(current) >= hhmmToMinutes(target);
}

async function acquireRunLock(runType, dateKey) {
  try {
    await JobRunLock.create({ job: JOB, runType, dateKey });
    return true;
  } catch {
    return false;
  }
}

async function releaseRunLock(runType, dateKey) {
  await JobRunLock.deleteOne({ job: JOB, runType, dateKey });
}

/** Idempotent daily auto-submit for daily tasks at 17:30 IST (mandeep@gmail.com). */
export async function runAutoSubmitDueTasksTick(now = new Date(), { force = false } = {}) {
  const emails = AUTO_SUBMIT_ASSIGNEE_EMAILS;
  if (!emails.length) return { skipped: true, reason: "no assignee emails configured" };

  const hm = hhmmInTz(now);
  if (!force && !shouldRunNow(hm, SUBMIT_AT)) {
    return { skipped: true, reason: "not time yet", at: SUBMIT_AT, tz: TZ, now: hm };
  }

  const dateKey = dateKeyInTz(now);
  const assignees = [];

  for (const email of emails) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const runType = normalizedEmail.replace(/[^a-z0-9]+/gi, "_").slice(0, 64);

    // eslint-disable-next-line no-await-in-loop
    const user = await User.findOne({ email: normalizedEmail })
      .select("_id name email weekOffDays active")
      .lean();
    if (!user || user.active === false) {
      assignees.push({ email: normalizedEmail, skipped: true, reason: "user not found or inactive" });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    let gotLock = true;
    if (!force) {
      gotLock = await acquireRunLock(runType, dateKey);
      if (!gotLock) {
        assignees.push({ email: normalizedEmail, skipped: true, reason: "already ran today" });
        continue;
      }
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const stats = await autoSubmitDueTasksForUser(user, now);
      assignees.push({ email: normalizedEmail, userId: String(user._id), ...stats });
    } catch (e) {
      if (!force) {
        // eslint-disable-next-line no-await-in-loop
        await releaseRunLock(runType, dateKey);
      }
      assignees.push({ email: normalizedEmail, error: e?.message || "auto-submit failed" });
      console.error(`[auto-submit] failed for ${normalizedEmail}:`, e);
    }
  }

  console.log(`[auto-submit] tick ${dateKey} ${hm}${force ? " (forced)" : ""}:`, JSON.stringify(assignees));

  return { dateKey, at: SUBMIT_AT, tz: TZ, forced: force, assignees };
}

export function startAutoSubmitDueTasksScheduler() {
  void runAutoSubmitDueTasksTick().catch((e) => console.error("[auto-submit] startup tick failed:", e));
  setInterval(() => {
    runAutoSubmitDueTasksTick().catch((e) => console.error("[auto-submit] tick failed:", e));
  }, 60_000);
  console.log(
    `[auto-submit] scheduler started (assignees=${AUTO_SUBMIT_ASSIGNEE_EMAILS.join(", ")}, at=${SUBMIT_AT}, tz=${TZ})`
  );
}
