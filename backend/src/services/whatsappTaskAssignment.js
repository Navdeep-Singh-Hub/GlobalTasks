import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { normalizePhone, sendWhatsAppText } from "./whatsappService.js";

const TZ = process.env.WHATSAPP_DIGEST_TIMEZONE || "Asia/Kolkata";
const MAX_MESSAGE_CHARS = 4000;
const ENABLED = String(process.env.WHATSAPP_TASK_ASSIGN_ENABLED ?? "true").toLowerCase() === "true";

function appBaseUrl() {
  const raw = (process.env.CLIENT_ORIGIN || process.env.CLIENT_ORIGINS || "http://localhost:3000")
    .split(",")[0]
    .trim();
  return raw.replace(/\/+$/g, "");
}

function formatLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDueDate(d) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(d));
}

function recurrenceSummary(task) {
  if (!task?.recurrence || task.taskType === "one_time") return "";
  const r = task.recurrence;
  const parts = [];
  if (r.forever) parts.push("repeats until stopped");
  else if (r.endDate) parts.push(`until ${formatDueDate(r.endDate)}`);
  if (r.weekOff) parts.push(`week off: ${r.weekOff}`);
  if (r.includeSunday === false && r.weekOff === "Sunday") parts.push("excludes Sunday");
  return parts.length ? parts.join("; ") : "";
}

async function loadTaskDoc(taskOrId) {
  const id = taskOrId?._id || taskOrId;
  return Task.findById(id)
    .populate("departmentId", "name code")
    .populate("centerId", "name code")
    .populate("project", "name")
    .populate("createdBy", "name")
    .lean();
}

export function buildTaskAssignedWhatsAppMessage({ task, assigneeName, assignedByName }) {
  const lines = [];
  const by = assignedByName ? ` by ${assignedByName}` : "";
  lines.push(`New task assigned${by}`);
  if (assigneeName) {
    lines.push("");
    lines.push(`Hi ${assigneeName},`);
  }
  lines.push("");
  lines.push(`Title: ${task.title}`);
  if (task.taskIdDisplay) lines.push(`Task ID: ${task.taskIdDisplay}`);
  lines.push("");
  lines.push("Description:");
  lines.push(String(task.description || "").trim() || "(no description)");
  lines.push("");
  lines.push("Details:");
  lines.push(`• Type: ${formatLabel(task.taskType)}`);
  lines.push(`• Priority: ${formatLabel(task.priority)}`);
  lines.push(`• Status: ${formatLabel(task.status)}`);
  lines.push(`• Due: ${formatDueDate(task.dueDate)}`);
  const dept = task.departmentId?.name || task.departmentId?.code;
  const center = task.centerId?.name || task.centerId?.code;
  const project = task.project?.name;
  if (dept) lines.push(`• Department: ${dept}`);
  if (center) lines.push(`• Center: ${center}`);
  if (project) lines.push(`• Project: ${project}`);
  if (task.functionTag) lines.push(`• Function: ${task.functionTag}`);
  if (Array.isArray(task.tags) && task.tags.length) lines.push(`• Tags: ${task.tags.join(", ")}`);
  const recur = recurrenceSummary(task);
  if (recur) lines.push(`• Recurrence: ${recur}`);
  if (task.requiresApproval) lines.push("• Completion requires approval: Yes");
  const required = Array.isArray(task.requiredInputsSchema?.required) ? task.requiredInputsSchema.required : [];
  if (required.length) lines.push(`• Required inputs: ${required.join(", ")}`);
  const attCount = Array.isArray(task.attachments) ? task.attachments.length : 0;
  if (attCount) lines.push(`• Attachments: ${attCount} file(s) — open app to view`);
  if (task.voiceNoteUrl) lines.push("• Voice note attached — open app to listen");
  lines.push("");
  lines.push(`Open GlobalTasks: ${appBaseUrl()}/pending-single`);

  let text = lines.join("\n");
  if (text.length > MAX_MESSAGE_CHARS) {
    const desc = String(task.description || "").trim();
    const overhead = text.length - desc.length + 40;
    const maxDesc = Math.max(200, MAX_MESSAGE_CHARS - overhead);
    const shortDesc = desc.length > maxDesc ? `${desc.slice(0, maxDesc)}… (description truncated)` : desc;
    const idx = lines.findIndex((l) => l === "Description:");
    if (idx >= 0 && lines[idx + 1] !== undefined) lines[idx + 1] = shortDesc;
    text = lines.join("\n");
  }
  return text;
}

async function sendToUser({ user, text, taskId }) {
  const phone = normalizePhone(user.phone);
  if (phone.length < 10) {
    return { userId: user._id, skipped: true, reason: "invalid_phone" };
  }
  try {
    const result = await sendWhatsAppText({ to: phone, text });
    if (result?.skipped) return { userId: user._id, skipped: true, reason: result.reason };
    return { userId: user._id, sent: true, stub: Boolean(result?.stub) };
  } catch (e) {
    console.error(`[whatsapp] task assign send failed user=${user._id} task=${taskId}:`, e.message || e);
    return { userId: user._id, failed: true };
  }
}

/**
 * Send immediate WhatsApp to newly assigned users (non-blocking for API callers).
 */
export async function notifyTaskAssignedWhatsApp({ taskId, assigneeIds, assignedByUserId }) {
  if (!ENABLED || !assigneeIds?.length) return { ok: true, skipped: true, reason: "disabled_or_empty" };

  const ids = [...new Set(assigneeIds.map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return { ok: true, skipped: true, reason: "no_assignees" };

  const [task, assignees, assigner] = await Promise.all([
    loadTaskDoc(taskId),
    User.find({ _id: { $in: ids }, active: true }).select("_id name phone").lean(),
    assignedByUserId ? User.findById(assignedByUserId).select("name").lean() : null,
  ]);
  if (!task) return { ok: false, reason: "task_not_found" };

  const assignedByName = assigner?.name || task.createdBy?.name || "";
  const results = [];
  for (const user of assignees) {
    const text = buildTaskAssignedWhatsAppMessage({
      task,
      assigneeName: user.name,
      assignedByName,
    });
    // eslint-disable-next-line no-await-in-loop
    const r = await sendToUser({ user, text, taskId: task._id });
    results.push(r);
  }
  return { ok: true, results };
}

/** Fire-and-forget wrapper for route handlers. */
export function queueTaskAssignedWhatsApp(payload) {
  void notifyTaskAssignedWhatsApp(payload).catch((e) =>
    console.error("[whatsapp] task assign notify failed:", e.message || e)
  );
}
