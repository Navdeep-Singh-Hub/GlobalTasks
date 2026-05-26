import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { Department } from "../models/Department.js";
import { Center } from "../models/Center.js";
import { Project } from "../models/Project.js";
import {
  normalizePhone,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  isWhatsAppConfigured,
  sanitizeTemplateParam,
  isTemplateMissingError,
  isTemplateParamError,
} from "./whatsappService.js";

const TZ = process.env.WHATSAPP_DIGEST_TIMEZONE || "Asia/Kolkata";
const MAX_MESSAGE_CHARS = 4000;
const MAX_TEMPLATE_DETAILS_CHARS = 900;
const ENABLED = String(process.env.WHATSAPP_TASK_ASSIGN_ENABLED ?? "true").toLowerCase() === "true";
const TASK_TEMPLATE = String(process.env.WHATSAPP_TEMPLATE_TASK_ASSIGNED || "").trim();
const MORNING_TEMPLATE = String(process.env.WHATSAPP_TEMPLATE_MORNING || "globaltasks_morning_digest_v1").trim();
const TEMPLATE_LANG = String(process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en").trim();

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
  const task = await Task.findById(id).lean();
  if (!task) return null;

  const [departmentId, centerId, project, createdBy] = await Promise.all([
    task.departmentId ? Department.findById(task.departmentId).select("name code").lean() : null,
    task.centerId ? Center.findById(task.centerId).select("name code").lean() : null,
    task.project ? Project.findById(task.project).select("name").lean() : null,
    task.createdBy ? User.findById(task.createdBy).select("name").lean() : null,
  ]);

  return { ...task, departmentId, centerId, project, createdBy };
}

function buildTaskDetailsLines(task) {
  const lines = [];
  const desc = String(task.description || "").trim();
  if (desc) {
    lines.push("Description:");
    lines.push(desc);
    lines.push("");
  }
  lines.push(`Type: ${formatLabel(task.taskType)}`);
  lines.push(`Priority: ${formatLabel(task.priority)}`);
  lines.push(`Due: ${formatDueDate(task.dueDate)}`);
  const dept = task.departmentId?.name || task.departmentId?.code;
  const center = task.centerId?.name || task.centerId?.code;
  const project = task.project?.name;
  if (dept) lines.push(`Department: ${dept}`);
  if (center) lines.push(`Center: ${center}`);
  if (project) lines.push(`Project: ${project}`);
  if (task.functionTag) lines.push(`Function: ${task.functionTag}`);
  if (Array.isArray(task.tags) && task.tags.length) lines.push(`Tags: ${task.tags.join(", ")}`);
  const recur = recurrenceSummary(task);
  if (recur) lines.push(`Recurrence: ${recur}`);
  if (task.requiresApproval) lines.push("Approval required: Yes");
  const required = Array.isArray(task.requiredInputsSchema?.required) ? task.requiredInputsSchema.required : [];
  if (required.length) lines.push(`Required inputs: ${required.join(", ")}`);
  const attCount = Array.isArray(task.attachments) ? task.attachments.length : 0;
  if (attCount) lines.push(`Attachments: ${attCount} file(s)`);
  if (task.voiceNoteUrl) lines.push("Voice note: yes");
  lines.push(`App: ${appBaseUrl()}/pending-single`);
  return lines;
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
  lines.push(...buildTaskDetailsLines(task));

  let text = lines.join("\n");
  if (text.length > MAX_MESSAGE_CHARS) {
    text = `${text.slice(0, MAX_MESSAGE_CHARS - 20)}… (truncated)`;
  }
  return text;
}

function buildTaskDetailLines(task, assignedByName) {
  const lines = [];
  lines.push(`From ${assignedByName || "Admin"}`);
  lines.push(`Title: ${task.title}`);
  const desc = String(task.description || "").trim();
  if (desc) lines.push(`Description: ${desc}`);
  lines.push(`Type: ${formatLabel(task.taskType)}`);
  lines.push(`Priority: ${formatLabel(task.priority)}`);
  lines.push(`Due: ${formatDueDate(task.dueDate)}`);
  const dept = task.departmentId?.name || task.departmentId?.code;
  const center = task.centerId?.name || task.centerId?.code;
  const project = task.project?.name;
  if (dept) lines.push(`Department: ${dept}`);
  if (center) lines.push(`Center: ${center}`);
  if (project) lines.push(`Project: ${project}`);
  if (task.functionTag) lines.push(`Function: ${task.functionTag}`);
  if (Array.isArray(task.tags) && task.tags.length) lines.push(`Tags: ${task.tags.join(", ")}`);
  const recur = recurrenceSummary(task);
  if (recur) lines.push(`Recurrence: ${recur}`);
  if (task.requiresApproval) lines.push("Approval required: Yes");
  const required = Array.isArray(task.requiredInputsSchema?.required) ? task.requiredInputsSchema.required : [];
  if (required.length) lines.push(`Required inputs: ${required.join(", ")}`);
  const attCount = Array.isArray(task.attachments) ? task.attachments.length : 0;
  if (attCount) lines.push(`Attachments: ${attCount} file(s) - open app`);
  if (task.voiceNoteUrl) lines.push("Voice note: yes - open app");
  lines.push(`Open: ${appBaseUrl()}/pending-single`);
  return lines;
}

/** {{2}} for globaltasks_task_assigned_v1 — one detail per line. */
function buildMultilineTaskSummary(task, assignedByName) {
  return sanitizeTemplateParam(buildTaskDetailLines(task, assignedByName).join("\n"), MAX_TEMPLATE_DETAILS_CHARS);
}

/** Morning digest fallback: approved template only allows single-line {{2}}. */
function buildSingleLineTaskSummary(task, assignedByName) {
  return sanitizeTemplateParam(buildTaskDetailLines(task, assignedByName).join(" · "), MAX_TEMPLATE_DETAILS_CHARS);
}

function buildTaskAssignedTemplateParams({ task, assigneeName, assignedByName }) {
  return [assigneeName || "there", buildMultilineTaskSummary(task, assignedByName)];
}

async function sendTaskAssignedToUser({ user, task, assignedByName, taskId }) {
  const phone = normalizePhone(user.phone);
  if (phone.length < 10) {
    return { userId: user._id, skipped: true, reason: "invalid_phone", phone: user.phone };
  }

  const text = buildTaskAssignedWhatsAppMessage({
    task,
    assigneeName: user.name,
    assignedByName,
  });
  const templateParams = buildTaskAssignedTemplateParams({
    task,
    assigneeName: user.name,
    assignedByName,
  });

  if (!isWhatsAppConfigured()) {
    console.log(`[whatsapp:stub] task assign to=${phone} title=${task.title}`);
    return { userId: user._id, sent: true, stub: true };
  }

  const templateAttempts = [];
  if (TASK_TEMPLATE) {
    templateAttempts.push({ name: TASK_TEMPLATE, params: templateParams, label: "task" });
  }
  if (MORNING_TEMPLATE && MORNING_TEMPLATE !== TASK_TEMPLATE) {
    templateAttempts.push({
      name: MORNING_TEMPLATE,
      params: [
        templateParams[0],
        sanitizeTemplateParam(`NEW TASK: ${buildSingleLineTaskSummary(task, assignedByName)}`),
      ],
      label: "morning_fallback",
    });
  }

  for (const attempt of templateAttempts) {
    try {
      const result = await sendWhatsAppTemplate({
        to: phone,
        name: attempt.name,
        languageCode: TEMPLATE_LANG,
        parameters: attempt.params,
      });
      if (!result?.skipped) {
        console.log(
          `[whatsapp] task assign sent (${attempt.label}/${attempt.name}) user=${user._id} task=${taskId} to=${phone} msgId=${result.messageId || ""}`
        );
        return {
          userId: user._id,
          sent: true,
          channel: attempt.label,
          template: attempt.name,
          messageId: result.messageId,
        };
      }
    } catch (e) {
      const retryable = isTemplateMissingError(e) || isTemplateParamError(e);
      console.warn(
        `[whatsapp] task assign template ${attempt.name} failed user=${user._id}:`,
        e.message || e,
        retryable ? "(trying next)" : ""
      );
      if (!retryable) break;
    }
  }

  try {
    const result = await sendWhatsAppText({ to: phone, text });
    if (result?.skipped) return { userId: user._id, skipped: true, reason: result.reason };
    console.log(
      `[whatsapp] task assign sent (text) user=${user._id} task=${taskId} to=${phone} msgId=${result.messageId || ""}`
    );
    return {
      userId: user._id,
      sent: true,
      channel: "text",
      stub: Boolean(result?.stub),
      messageId: result.messageId,
    };
  } catch (e) {
    const needsTemplate = e?.meta?.code === 131047 || String(e.message || "").includes("re-engagement");
    console.error(
      `[whatsapp] task assign send failed user=${user._id} task=${taskId} phone=${phone}:`,
      e.message || e,
      needsTemplate ? "→ Ask user to message your business WhatsApp once, or approve globaltasks_task_assigned_v1" : ""
    );
    return { userId: user._id, failed: true, needsTemplate: Boolean(needsTemplate), error: e.message };
  }
}

/**
 * Send immediate WhatsApp to newly assigned users.
 */
export async function notifyTaskAssignedWhatsApp({ taskId, assigneeIds, assignedByUserId }) {
  if (!ENABLED) {
    console.log("[whatsapp] task assign skipped (WHATSAPP_TASK_ASSIGN_ENABLED=false)");
    return { ok: true, skipped: true, reason: "disabled" };
  }
  if (!assigneeIds?.length) return { ok: true, skipped: true, reason: "no_assignees" };

  const ids = [...new Set(assigneeIds.map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return { ok: true, skipped: true, reason: "no_assignees" };

  const [task, assignees, assigner] = await Promise.all([
    loadTaskDoc(taskId),
    User.find({ _id: { $in: ids }, active: true }).select("_id name phone").lean(),
    assignedByUserId ? User.findById(assignedByUserId).select("name").lean() : null,
  ]);

  if (!task) {
    console.error(`[whatsapp] task assign: task not found ${taskId}`);
    return { ok: false, reason: "task_not_found" };
  }
  if (!assignees.length) {
    console.warn(`[whatsapp] task assign: no active assignees with ids ${ids.join(",")}`);
    return { ok: true, skipped: true, reason: "no_active_assignees" };
  }

  const assignedByName = assigner?.name || task.createdBy?.name || "";
  console.log(
    `[whatsapp] task assign sending task=${taskId} title="${task.title}" assignees=${assignees.length} configured=${isWhatsAppConfigured()} template=${TASK_TEMPLATE || "none"}`
  );

  const results = [];
  for (const user of assignees) {
    // eslint-disable-next-line no-await-in-loop
    const r = await sendTaskAssignedToUser({ user, task, assignedByName, taskId: task._id });
    results.push(r);
  }
  return { ok: true, results };
}

/** Fire-and-forget wrapper for route handlers. */
export function queueTaskAssignedWhatsApp(payload) {
  void notifyTaskAssignedWhatsApp(payload)
    .then((r) => {
      const failed = r.results?.filter((x) => x.failed)?.length || 0;
      const sent = r.results?.filter((x) => x.sent)?.length || 0;
      if (failed) console.warn(`[whatsapp] task assign done task=${payload.taskId} sent=${sent} failed=${failed}`, r);
    })
    .catch((e) => console.error("[whatsapp] task assign notify failed:", e.message || e));
}
