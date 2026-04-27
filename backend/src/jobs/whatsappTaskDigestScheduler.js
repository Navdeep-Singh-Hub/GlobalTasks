import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { sendWhatsAppText } from "../services/whatsappService.js";
import { JobRunLock } from "../models/JobRunLock.js";

const TZ = process.env.WHATSAPP_DIGEST_TIMEZONE || "Asia/Kolkata";
const JOB = "whatsapp_task_digest";
const MORNING_AT = process.env.WHATSAPP_MORNING_AT || "09:45";
const EVENING_AT = process.env.WHATSAPP_EVENING_AT || "17:59";

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

function istDayRangeAsUtc(d = new Date()) {
  const p = zonedParts(d);
  const y = Number(p.year);
  const m = Number(p.month);
  const day = Number(p.day);
  // Convert local IST day boundaries to UTC timestamps.
  const startUtc = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0) - (5.5 * 60 * 60 * 1000));
  const endUtc = new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999) - (5.5 * 60 * 60 * 1000));
  return { startUtc, endUtc };
}

async function acquireRunLock(runType, dateKey) {
  try {
    await JobRunLock.create({ job: JOB, runType, dateKey });
    return true;
  } catch {
    return false;
  }
}

function shouldRunNow(current, target) {
  return current >= target;
}

async function safeSendDigestMessage({ user, text, runType }) {
  try {
    const result = await sendWhatsAppText({ to: user.phone, text });
    if (result?.skipped) return { sent: 0, skipped: 1, failed: 0 };
    return { sent: 1, skipped: 0, failed: 0 };
  } catch (e) {
    console.error(`[whatsapp] ${runType} send failed user=${user._id} phone=${user.phone}:`, e.message || e);
    return { sent: 0, skipped: 0, failed: 1 };
  }
}

async function runMorningDigest(now = new Date()) {
  const users = await User.find({ active: true, phone: { $ne: "" } }).select("_id name phone").lean();
  const stats = { recipients: users.length, considered: 0, sent: 0, skipped: 0, failed: 0 };
  for (const u of users) {
    const tasks = await Task.find({
      assignees: u._id,
      deletedAt: null,
      status: { $in: ["pending", "in_progress", "awaiting_approval", "overdue"] },
    })
      .select("title dueDate status")
      .sort({ dueDate: 1 })
      .limit(8)
      .lean();
    if (!tasks.length) continue;
    stats.considered += 1;
    const lines = tasks.map((t, idx) => `${idx + 1}. ${t.title} (${t.status.replace("_", " ")})`);
    const text = `Good morning ${u.name}. Assigned tasks for today:\n${lines.join("\n")}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await safeSendDigestMessage({ user: u, text, runType: "morning" });
    stats.sent += res.sent;
    stats.skipped += res.skipped;
    stats.failed += res.failed;
  }
  return stats;
}

async function runEveningDigest(now = new Date()) {
  const users = await User.find({ active: true, phone: { $ne: "" } }).select("_id name phone").lean();
  const stats = { recipients: users.length, considered: 0, sent: 0, skipped: 0, failed: 0 };
  const { startUtc: from, endUtc: to } = istDayRangeAsUtc(now);
  for (const u of users) {
    const [completedToday, pendingNow] = await Promise.all([
      Task.countDocuments({
        assignees: u._id,
        deletedAt: null,
        status: "completed",
        completedAt: { $gte: from, $lte: to },
      }),
      Task.countDocuments({
        assignees: u._id,
        deletedAt: null,
        status: { $in: ["pending", "in_progress", "awaiting_approval", "overdue"] },
      }),
    ]);
    if (completedToday === 0 && pendingNow === 0) continue;
    stats.considered += 1;
    const text = `Daily summary for ${u.name}:\nCompleted today: ${completedToday}\nPending now: ${pendingNow}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await safeSendDigestMessage({ user: u, text, runType: "evening" });
    stats.sent += res.sent;
    stats.skipped += res.skipped;
    stats.failed += res.failed;
  }
  return stats;
}

async function tick() {
  const now = new Date();
  const key = dateKeyInTz(now);
  const hm = hhmmInTz(now);

  if (shouldRunNow(hm, MORNING_AT)) {
    const gotLock = await acquireRunLock("morning", key);
    if (gotLock) {
      const stats = await runMorningDigest(now);
      console.log(`[whatsapp] morning digest done for ${key}`, stats);
    }
  }
  if (shouldRunNow(hm, EVENING_AT)) {
    const gotLock = await acquireRunLock("evening", key);
    if (gotLock) {
      const stats = await runEveningDigest(now);
      console.log(`[whatsapp] evening digest done for ${key}`, stats);
    }
  }
}

export function startWhatsAppTaskDigestScheduler() {
  void tick().catch((e) => console.error("[whatsapp] startup digest check failed:", e));
  setInterval(() => {
    tick().catch((e) => console.error("[whatsapp] digest run failed:", e));
  }, 60_000);
  console.log(`[whatsapp] digest scheduler started (${MORNING_AT}, ${EVENING_AT}, tz=${TZ})`);
}

