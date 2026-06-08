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

import { formatAppDate } from "../utils/dateFormat.js";

const MAX_MESSAGE_CHARS = 4000;
const MAX_TEMPLATE_DETAILS_CHARS = 512;
const ENABLED = String(process.env.WHATSAPP_TASK_ASSIGN_ENABLED ?? "true").toLowerCase() === "true";
const TEMPLATE_LANG = String(process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en").trim();

/**
 * Task assign uses the same Meta template as the 09:45 morning digest:
 * globaltasks_morning_digest_v1 — {{1}} assignee name, {{2}} body (numbered list).
 */
const ASSIGN_TEMPLATE = String(
  process.env.WHATSAPP_TEMPLATE_MORNING ||
    process.env.WHATSAPP_TEMPLATE_TASK_ASSIGNED ||
    "globaltasks_morning_digest_v1"
).trim();

function formatLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDueDate(d) {
  return formatAppDate(d);
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

export function buildTaskAssignedWhatsAppMessage({ task, assigneeName, assignedByName }) {
  const { text } = buildMorningStyleAssignContent({ task, assigneeName, assignedByName });
  if (text.length > MAX_MESSAGE_CHARS) {
    return `${text.slice(0, MAX_MESSAGE_CHARS - 20)}… (truncated)`;
  }
  return text;
}

/**
 * {{2}} for globaltasks_morning_digest_v1 — one line with due date and assigner only.
 */
function buildTaskAssignMorningBody({ task, assignedByName }) {
  const typeLabel = formatLabel(task.taskType);
  const due = formatDueDate(task.dueDate);
  let line = `1. ${task.title} (${typeLabel}) - Due: ${due}`;
  if (assignedByName) line += ` - Assigned by: ${assignedByName}`;
  return sanitizeTemplateParam(line, MAX_TEMPLATE_DETAILS_CHARS);
}

function buildMorningStyleAssignContent({ task, assigneeName, assignedByName }) {
  const name = assigneeName || "there";
  const body = buildTaskAssignMorningBody({ task, assignedByName });
  const text = `Good morning ${name}. Daily checklist for today:\n\n${body}`;
  return {
    text,
    templateName: ASSIGN_TEMPLATE,
    templateParams: [name, body],
  };
}

async function sendTaskAssignedToUser({ user, task, assignedByName, taskId }) {
  const phone = normalizePhone(user.phone);
  if (phone.length < 10) {
    console.warn(
      `[whatsapp] task assign skipped user=${user._id} name=${user.name || ""} reason=invalid_phone stored=${user.phone || "(empty)"}`
    );
    return { userId: user._id, skipped: true, reason: "invalid_phone", phone: user.phone };
  }

  const content = buildMorningStyleAssignContent({
    task,
    assigneeName: user.name,
    assignedByName,
  });

  if (!isWhatsAppConfigured()) {
    console.log(`[whatsapp:stub] task assign to=${phone} title=${task.title}\n${content.text}`);
    return { userId: user._id, sent: true, stub: true };
  }

  if (ASSIGN_TEMPLATE) {
    try {
      const result = await sendWhatsAppTemplate({
        to: phone,
        name: ASSIGN_TEMPLATE,
        languageCode: TEMPLATE_LANG,
        parameters: content.templateParams,
      });
      if (!result?.skipped) {
        console.log(
          `[whatsapp] task assign sent (morning template/${ASSIGN_TEMPLATE}) user=${user._id} task=${taskId} to=${phone} msgId=${result.messageId || ""}`
        );
        return {
          userId: user._id,
          sent: true,
          channel: "morning_template",
          template: ASSIGN_TEMPLATE,
          messageId: result.messageId,
        };
      }
    } catch (e) {
      const retryable = isTemplateMissingError(e) || isTemplateParamError(e);
      console.warn(
        `[whatsapp] task assign template ${ASSIGN_TEMPLATE} failed user=${user._id}:`,
        e.message || e,
        retryable ? "(falling back to plain text)" : ""
      );
      if (!retryable) {
        return { userId: user._id, failed: true, error: e.message };
      }
    }
  }

  try {
    const result = await sendWhatsAppText({ to: phone, text: content.text });
    if (result?.skipped) return { userId: user._id, skipped: true, reason: result.reason };
    console.log(
      `[whatsapp] task assign sent (text/morning format) user=${user._id} task=${taskId} to=${phone} msgId=${result.messageId || ""}`
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
      needsTemplate
        ? `→ Approve ${ASSIGN_TEMPLATE} in Meta or ask user to message your business WhatsApp once`
        : ""
    );
    return { userId: user._id, failed: true, needsTemplate: Boolean(needsTemplate), error: e.message };
  }
}

/**
 * Send immediate WhatsApp to newly assigned users (morning digest template).
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
    `[whatsapp] task assign sending task=${taskId} title="${task.title}" assignees=${assignees.length} configured=${isWhatsAppConfigured()} template=${ASSIGN_TEMPLATE || "none"} (morning digest format)`
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

export { ASSIGN_TEMPLATE, buildTaskAssignMorningBody, buildMorningStyleAssignContent };
