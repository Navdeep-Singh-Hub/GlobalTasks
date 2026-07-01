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

function shouldRunNow(current, target) {
  return current >= target;
}

async function acquireRunLock(runType, dateKey) {
  try {
    await JobRunLock.create({ job: JOB, runType, dateKey });
    return true;
  } catch {
    return false;
  }
}

/** Idempotent daily auto-submit for daily tasks at 17:30 IST (mandeep@gmail.com). */
export async function runAutoSubmitDueTasksTick(now = new Date()) {
  const emails = AUTO_SUBMIT_ASSIGNEE_EMAILS;
  if (!emails.length) return { skipped: true, reason: "no assignee emails configured" };

  const hm = hhmmInTz(now);
  if (!shouldRunNow(hm, SUBMIT_AT)) {
    return { skipped: true, reason: "not time yet", at: SUBMIT_AT, tz: TZ, now: hm };
  }

  const dateKey = dateKeyInTz(now);
  const assignees = [];

  for (const email of emails) {
    const runType = email.replace(/[^a-z0-9]+/gi, "_").slice(0, 64);
    // eslint-disable-next-line no-await-in-loop
    const gotLock = await acquireRunLock(runType, dateKey);
    if (!gotLock) {
      assignees.push({ email, skipped: true, reason: "already ran today" });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const user = await User.findOne({ email })
      .select("_id name email weekOffDays active")
      .lean();
    if (!user || user.active === false) {
      assignees.push({ email, skipped: true, reason: "user not found or inactive" });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const stats = await autoSubmitDueTasksForUser(user, now);
    assignees.push({ email, userId: String(user._id), ...stats });
  }

  return { dateKey, at: SUBMIT_AT, tz: TZ, assignees };
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
