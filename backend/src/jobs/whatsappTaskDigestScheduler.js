import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { normalizePhone, sendWhatsAppTemplate, sendWhatsAppText } from "../services/whatsappService.js";
import { JobRunLock } from "../models/JobRunLock.js";
import { normalizeRole } from "../constants/roles.js";

const TZ = process.env.WHATSAPP_DIGEST_TIMEZONE || "Asia/Kolkata";
const JOB = "whatsapp_task_digest";
const MORNING_AT = process.env.WHATSAPP_MORNING_AT || "09:45";
const EVENING_AT = process.env.WHATSAPP_EVENING_AT || "17:59";
const MORNING_TEMPLATE = String(process.env.WHATSAPP_TEMPLATE_MORNING || "").trim();
const EVENING_TEMPLATE = String(process.env.WHATSAPP_TEMPLATE_EVENING || "").trim();
const TEMPLATE_LANG = String(process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en").trim();
const SEND_GAP_MS = Math.max(0, Number(process.env.WHATSAPP_DIGEST_SEND_GAP_MS || "120") || 0);

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

export function dateKeyInTz(d = new Date()) {
  const p = zonedParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

export async function clearDigestRunLock(runType, dateKey) {
  await JobRunLock.deleteMany({ job: JOB, runType, dateKey });
}

function buildMorningDigestContent(user) {
  const role = normalizeRole(user.role);
  const dailySheetLabels = [];
  if (role === "supervisor") dailySheetLabels.push("Fill Daily Supervisor Sheet");
  if (role === "coordinator") dailySheetLabels.push("Fill Daily Coordinator Sheet");
  if (!dailySheetLabels.length) return null;

  const body = dailySheetLabels.map((label, idx) => `${idx + 1}. ${label} (daily)`).join("\n");
  const text = `Good morning ${user.name}. Daily checklist for today:\n${body}`;
  return {
    text,
    templateName: MORNING_TEMPLATE,
    templateParams: [user.name, body],
  };
}

function hhmmInTz(d = new Date()) {
  const p = zonedParts(d);
  return `${p.hour}:${p.minute}`;
}

/** "Completed today" window for evening digest. Offset matches Asia/Kolkata (UTC+5:30); use WHATSAPP_DIGEST_TIMEZONE=Asia/Kolkata for correct counts. */
function istDayRangeAsUtc(d = new Date()) {
  const p = zonedParts(d);
  const y = Number(p.year);
  const m = Number(p.month);
  const day = Number(p.day);
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const startUtc = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0) - istOffsetMs);
  const endUtc = new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999) - istOffsetMs);
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

/** Users eligible for digests: active, valid-looking phone (avoid silent admin fallback). */
async function loadDigestUsers() {
  const users = await User.find({ active: true }).select("_id name phone role").lean();
  return users.filter((u) => normalizePhone(u.phone).length >= 10);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function safeSendTemplateDigestMessage({ user, runType, templateName, parameters, fallbackText }) {
  try {
    const result = templateName
      ? await sendWhatsAppTemplate({ to: user.phone, name: templateName, languageCode: TEMPLATE_LANG, parameters })
      : await sendWhatsAppText({ to: user.phone, text: fallbackText });
    if (result?.skipped) return { sent: 0, skipped: 1, failed: 0 };
    return { sent: 1, skipped: 0, failed: 0 };
  } catch (e) {
    console.error(`[whatsapp] ${runType} template send failed user=${user._id} phone=${user.phone}:`, e.message || e);
    return safeSendDigestMessage({ user, text: fallbackText, runType });
  }
}

export async function runMorningDigest(now = new Date(), options = {}) {
  const { onlyUserId, onlyPhone, dryRun = false } = options;
  let users = await loadDigestUsers();
  if (onlyUserId) users = users.filter((u) => String(u._id) === String(onlyUserId));
  if (onlyPhone) {
    const want = normalizePhone(onlyPhone);
    users = users.filter((u) => normalizePhone(u.phone) === want);
  }

  const stats = { recipients: users.length, considered: 0, sent: 0, skipped: 0, failed: 0 };
  const previews = [];
  for (const u of users) {
    const content = buildMorningDigestContent(u);
    if (!content) continue;

    stats.considered += 1;
    if (dryRun) {
      previews.push({
        userId: u._id,
        name: u.name,
        role: u.role,
        phone: u.phone,
        text: content.text,
        templateName: content.templateName || null,
        templateParams: content.templateParams,
      });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const res = await safeSendTemplateDigestMessage({
      user: u,
      runType: "morning",
      templateName: content.templateName,
      parameters: content.templateParams,
      fallbackText: content.text,
    });
    stats.sent += res.sent;
    stats.skipped += res.skipped;
    stats.failed += res.failed;
    if (SEND_GAP_MS) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(SEND_GAP_MS);
    }
  }
  if (dryRun) return { ...stats, dryRun: true, previews };
  return stats;
}

async function runEveningDigest(now = new Date()) {
  const users = await loadDigestUsers();
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
    stats.considered += 1;
    const text = `Daily summary for ${u.name}:\nCompleted today: ${completedToday}\nPending now: ${pendingNow}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await safeSendTemplateDigestMessage({
      user: u,
      runType: "evening",
      templateName: EVENING_TEMPLATE,
      parameters: [u.name, String(completedToday), String(pendingNow)],
      fallbackText: text,
    });
    stats.sent += res.sent;
    stats.skipped += res.skipped;
    stats.failed += res.failed;
    if (SEND_GAP_MS) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(SEND_GAP_MS);
    }
  }
  return stats;
}

/** Run due digest windows (idempotent via JobRunLock). Safe to call from cron every minute. */
export async function runWhatsAppDigestTick(now = new Date()) {
  const key = dateKeyInTz(now);
  const hm = hhmmInTz(now);
  const result = {};

  if (shouldRunNow(hm, MORNING_AT)) {
    const gotLock = await acquireRunLock("morning", key);
    if (gotLock) {
      const stats = await runMorningDigest(now);
      console.log(`[whatsapp] morning digest done for ${key}`, stats);
      result.morning = stats;
    }
  }
  if (shouldRunNow(hm, EVENING_AT)) {
    const gotLock = await acquireRunLock("evening", key);
    if (gotLock) {
      const stats = await runEveningDigest(now);
      console.log(`[whatsapp] evening digest done for ${key}`, stats);
      result.evening = stats;
    }
  }
  return result;
}

export function startWhatsAppTaskDigestScheduler() {
  void runWhatsAppDigestTick().catch((e) => console.error("[whatsapp] startup digest check failed:", e));
  setInterval(() => {
    runWhatsAppDigestTick().catch((e) => console.error("[whatsapp] digest run failed:", e));
  }, 60_000);
  console.log(
    `[whatsapp] digest scheduler started (${MORNING_AT}, ${EVENING_AT}, tz=${TZ}, morningTemplate=${MORNING_TEMPLATE || "none"}, eveningTemplate=${EVENING_TEMPLATE || "none"})`
  );
}

