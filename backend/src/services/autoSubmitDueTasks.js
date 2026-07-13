import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { TaskEvent } from "../models/TaskEvent.js";
import { TaskApprovalRecord } from "../models/TaskApprovalRecord.js";
import { recordTaskSubmission, taskAssignerIdFromDoc } from "./taskApprovalHistory.js";
import { syncRecurringTasksForAssignee } from "./recurringOccurrenceSync.js";
import { notifyMany } from "./notificationService.js";
import {
  APP_TIMEZONE,
  calendarDayKeyInTz,
  isOccurrenceDueToday,
  startOfNextCalendarDayInTz,
} from "../utils/recurrence.js";
import { isWeekOffToday } from "../utils/weekoff.js";

const DEFAULT_REMARKS = "done";

function dueDateDayBounds(d, timeZone = APP_TIMEZONE) {
  const key = calendarDayKeyInTz(d, timeZone);
  const start = new Date(`${key}T00:00:00+05:30`);
  const end = new Date(startOfNextCalendarDayInTz(start, timeZone));
  return { start, end };
}

/** Hardcoded auto-submit targets (no env). */
export const AUTO_SUBMIT_ASSIGNEE_EMAILS = ["mandeep@gmail.com"];

async function hasPendingSubmissionForOccurrence(task, assigneeId) {
  if (task.status === "awaiting_approval" && task.approvalStatus === "pending") return true;
  if (task.notDoneApproval?.status === "pending") return true;

  const { start, end } = dueDateDayBounds(task.dueDate);
  const pending = await TaskApprovalRecord.findOne({
    taskId: task._id,
    assigneeId,
    status: "pending",
    kind: { $in: ["completion", "not_done"] },
    occurrenceDueDate: { $gte: start, $lt: end },
  })
    .select("_id")
    .lean();
  return !!pending;
}

function alignDailyDueDateForToday(task, now = new Date()) {
  if (task.taskType !== "daily" || isOccurrenceDueToday(task.dueDate, now)) return;
  const todayKey = calendarDayKeyInTz(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(task.dueDate));
  task.dueDate = new Date(`${todayKey}T${time}+05:30`);
}

/**
 * Auto-submit today's due **daily** tasks for one assignee at 5:30 PM IST.
 * Weekly / monthly / one-time etc. are never auto-submitted.
 * Skips tasks already awaiting approval or with a pending history row for today.
 */
export async function autoSubmitDueTasksForUser(assignee, now = new Date(), remarks = DEFAULT_REMARKS) {
  const assigneeId = assignee._id;
  if (isWeekOffToday(assignee.weekOffDays || [], now)) {
    return { submitted: 0, skipped: 0, weekOff: true, totalDueToday: 0 };
  }

  await syncRecurringTasksForAssignee(assigneeId);

  const candidates = await Task.find({
    assignees: assigneeId,
    deletedAt: null,
    taskType: "daily",
    requiresApproval: true,
    status: { $in: ["pending", "in_progress", "overdue"] },
  }).lean();

  const dueToday = candidates.filter((t) => isOccurrenceDueToday(t.dueDate, now));

  let submitted = 0;
  let skipped = 0;
  const taskIds = [];

  for (const raw of dueToday) {
    // eslint-disable-next-line no-await-in-loop
    if (await hasPendingSubmissionForOccurrence(raw, assigneeId)) {
      skipped += 1;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const task = await Task.findById(raw._id);
    if (!task) continue;

    alignDailyDueDateForToday(task, now);

    task.submissionRemarks = remarks;
    task.status = "awaiting_approval";
    task.approvalStatus = "pending";
    task.requiresApproval = true;
    task.completedAt = null;

    // eslint-disable-next-line no-await-in-loop
    await task.save();
    // eslint-disable-next-line no-await-in-loop
    await recordTaskSubmission({
      task,
      assigneeId,
      remarks,
      kind: "completion",
      source: "auto",
    });
    // eslint-disable-next-line no-await-in-loop
    await TaskEvent.create({
      taskId: task._id,
      actorId: assigneeId,
      eventType: "submitted",
      meta: { auto: true, remarks, taskType: task.taskType },
    });

    const approverId = taskAssignerIdFromDoc(task);
    if (approverId) {
      const snippet = remarks.slice(0, 240);
      // eslint-disable-next-line no-await-in-loop
      await notifyMany([approverId], {
        type: "task_approval_request",
        title: "Completion pending approval",
        message: `"${task.title}" was auto-submitted for completion (daily, due today). Remarks: ${snippet}`,
        link: "/for-approval",
      });
    }

    submitted += 1;
    taskIds.push(String(task._id));
  }

  if (submitted > 0) {
    console.log(
      `[auto-submit] ${assignee.email || assigneeId}: submitted ${submitted}, skipped ${skipped}, due today ${dueToday.length}`
    );
  }

  return { submitted, skipped, weekOff: false, totalDueToday: dueToday.length, taskIds };
}

export async function runAutoSubmitForConfiguredAssignees(now = new Date()) {
  const emails = AUTO_SUBMIT_ASSIGNEE_EMAILS;
  const results = [];

  for (const email of emails) {
    // eslint-disable-next-line no-await-in-loop
    const user = await User.findOne({ email })
      .select("_id name email weekOffDays active")
      .lean();
    if (!user || user.active === false) {
      results.push({ email, error: "user not found or inactive" });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const stats = await autoSubmitDueTasksForUser(user, now);
    results.push({ email, userId: String(user._id), ...stats });
  }

  return { results };
}
