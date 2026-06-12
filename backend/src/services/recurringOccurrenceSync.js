import { Task } from "../models/Task.js";
import { TaskApprovalRecord } from "../models/TaskApprovalRecord.js";
import { RECURRING_TYPES } from "../utils/recurrence.js";
import {
  APP_TIMEZONE,
  calendarDayKeyInTz,
  computeNextDueDate,
  isOccurrenceDueToday,
  isOccurrencePastDue,
  startOfNextCalendarDayInTz,
} from "../utils/recurrence.js";
import { taskAssignerIdFromDoc, effectivePendingOccurrenceDue, autoMissedRemarksForOccurrence } from "./taskApprovalHistory.js";
import { notifyMany } from "./notificationService.js";
import { logActivity } from "./activityService.js";

function dueDateDayBounds(d, timeZone = APP_TIMEZONE) {
  const key = calendarDayKeyInTz(d, timeZone);
  const start = new Date(`${key}T00:00:00+05:30`);
  const end = new Date(startOfNextCalendarDayInTz(start, timeZone));
  return { start, end, key };
}

/** Keep due time (e.g. 6:00 PM IST) but move to a calendar day. */
export function setDueDateToCalendarDay(dueDate, dayKey, timeZone = APP_TIMEZONE) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(dueDate));
  return new Date(`${dayKey}T${time}+05:30`);
}

export { isOccurrenceDueToday, isOccurrencePastDue } from "../utils/recurrence.js";

/** Pending Recurring: only today's occurrence (not past catch-up days). */
export function applyTodayOnlyDueFilter(filter, now = new Date()) {
  const todayKey = calendarDayKeyInTz(now);
  const start = new Date(`${todayKey}T00:00:00+05:30`);
  const end = startOfNextCalendarDayInTz(now);
  filter.dueDate = { ...(filter.dueDate || {}), $gte: start, $lt: end };
}

/** Assignee inbox: daily = today only; other recurring = due today or overdue. */
export function applyAssigneeRecurringWorkableFilter(filter, now = new Date()) {
  const todayKey = calendarDayKeyInTz(now);
  const start = new Date(`${todayKey}T00:00:00+05:30`);
  const end = startOfNextCalendarDayInTz(now);
  const workableClause = {
    $or: [
      { taskType: "daily", dueDate: { $gte: start, $lt: end } },
      { taskType: { $ne: "daily" }, dueDate: { $lt: end } },
    ],
  };
  if (filter.$and) {
    filter.$and.push(workableClause);
  } else if (filter.$or) {
    filter.$and = [{ $or: filter.$or }, workableClause];
    delete filter.$or;
  } else {
    Object.assign(filter, workableClause);
  }
}

export function isAssigneeRecurringWorkable(task, now = new Date()) {
  if (!task?.dueDate) return false;
  if (task.taskType === "daily") {
    return isOccurrenceDueToday(task.dueDate, now);
  }
  const todayKey = calendarDayKeyInTz(now);
  return calendarDayKeyInTz(task.dueDate) <= todayKey;
}

export async function recordMissedOccurrence({ task, occurrenceDueDate, assigneeId, remarks, now = new Date() }) {
  const assignedBy = taskAssignerIdFromDoc(task);
  if (!assignedBy || !assigneeId) return null;

  const todayKey = calendarDayKeyInTz(now);
  const occKey = calendarDayKeyInTz(occurrenceDueDate);
  if (!occKey || occKey > todayKey) return null;
  if (occKey === todayKey) {
    if (task?.taskType === "daily") return null;
    if (!isOccurrencePastDue(occurrenceDueDate, now)) return null;
  }

  const autoRemarks = remarks || autoMissedRemarksForOccurrence(occurrenceDueDate, now);
  const { start, end } = dueDateDayBounds(occurrenceDueDate);
  const existing = await TaskApprovalRecord.findOne({
    taskId: task._id,
    assigneeId,
    occurrenceDueDate: { $gte: start, $lt: end },
    status: { $in: ["missed", "approved", "pending", "not_done_acknowledged", "rejected"] },
  }).lean();
  if (existing) {
    if (existing.status === "approved" || existing.status === "not_done_acknowledged") return existing;
    if (existing.status === "pending" && existing.kind === "not_done") return existing;
    if (existing.status === "pending") {
      await TaskApprovalRecord.updateOne(
        { _id: existing._id },
        {
          $set: {
            status: "missed",
            kind: "not_done",
            submissionRemarks: autoRemarks,
          },
        }
      );
    }
    return existing;
  }

  const record = await TaskApprovalRecord.create({
    taskId: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    centerId: task.centerId || null,
    assignedBy,
    assigneeId,
    occurrenceDueDate,
    submittedAt: now,
    submissionRemarks: autoRemarks,
    kind: "not_done",
    status: "missed",
  });

  if (assignedBy) {
    await notifyMany([assignedBy], {
      type: "task_not_done",
      title: "Recurring task not done",
      message: `"${task.title}" was not completed for ${calendarDayKeyInTz(occurrenceDueDate)}.`,
      link: "/performance",
    });
  }

  return record;
}

/**
 * Advance a recurring task from a past due date to today, recording each skipped day as missed.
 */
export async function syncRecurringTaskToToday(task, { assigneeId, now = new Date() } = {}) {
  if (!task?.taskType || !RECURRING_TYPES.includes(task.taskType)) return { synced: false, missed: 0 };

  const todayKey = calendarDayKeyInTz(now);
  const dueKey = calendarDayKeyInTz(task.dueDate);
  const pastDue = isOccurrencePastDue(task.dueDate, now);

  if (dueKey > todayKey) {
    return { synced: false, missed: 0 };
  }

  if (task.taskType === "daily" && dueKey === todayKey) {
    if (task.status === "awaiting_approval" || task.approvalStatus === "pending") {
      const pending = await TaskApprovalRecord.findOne({
        taskId: task._id,
        status: "pending",
        kind: "completion",
      })
        .sort({ submittedAt: -1 })
        .lean();
      if (pending) {
        const effectiveDue = effectivePendingOccurrenceDue(pending, task);
        if (effectiveDue && calendarDayKeyInTz(task.dueDate) !== calendarDayKeyInTz(effectiveDue)) {
          task.dueDate = effectiveDue;
          await task.save();
        }
        return { synced: false, missed: 0 };
      }
      task.status = "pending";
      task.approvalStatus = "none";
      task.submissionRemarks = "";
      await task.save();
      return { synced: true, missed: 0 };
    }
    return { synced: false, missed: 0 };
  }

  if (task.status === "awaiting_approval" || task.approvalStatus === "pending") {
    const pending = await TaskApprovalRecord.findOne({
      taskId: task._id,
      status: "pending",
      kind: "completion",
    })
      .sort({ submittedAt: -1 })
      .lean();

    if (pending) {
      const effectiveDue = effectivePendingOccurrenceDue(pending, task);
      if (effectiveDue && calendarDayKeyInTz(task.dueDate) !== calendarDayKeyInTz(effectiveDue)) {
        task.dueDate = effectiveDue;
        await task.save();
      }
      return { synced: false, missed: 0 };
    }

    if (dueKey === todayKey && !pastDue) {
      task.status = "pending";
      task.approvalStatus = "none";
      task.submissionRemarks = "";
      await task.save();
      return { synced: true, missed: 0 };
    }
  }

  if (dueKey === todayKey && !pastDue) {
    return { synced: false, missed: 0 };
  }

  if (dueKey === todayKey && pastDue && task.taskType !== "daily") {
    return { synced: false, missed: 0 };
  }

  const primaryAssignee = assigneeId || (task.assignees || [])[0];
  if (!primaryAssignee) return { synced: false, missed: 0 };

  let missed = 0;
  let cursor = new Date(task.dueDate);
  const taskPlain = task.toObject ? task.toObject() : task;

  if (task.status === "completed") {
    const next = computeNextDueDate(task);
    task.status = "pending";
    task.approvalStatus = "none";
    task.completedAt = null;
    task.submissionRemarks = "";
    task.notDoneApproval = undefined;
    if (!next) {
      task.dueDate = setDueDateToCalendarDay(task.dueDate, todayKey);
      await task.save();
      return { synced: true, missed: 0 };
    }
    cursor = next;
  }

  if (task.status === "awaiting_approval" || task.approvalStatus === "pending") {
    const pendingApproval = await TaskApprovalRecord.findOne({
      taskId: task._id,
      status: "pending",
      kind: "completion",
    })
      .sort({ submittedAt: -1 })
      .lean();
    if (pendingApproval) {
      return { synced: false, missed: 0 };
    }

    const rec = await recordMissedOccurrence({
      task,
      occurrenceDueDate: task.dueDate,
      assigneeId: primaryAssignee,
      remarks: "Submitted for approval but the day ended before completion.",
      now,
    });
    if (rec) missed += 1;
    const next = computeNextDueDate(task);
    if (next) cursor = next;
    else {
      task.dueDate = setDueDateToCalendarDay(task.dueDate, todayKey);
      task.status = "pending";
      task.approvalStatus = "none";
      task.submissionRemarks = "";
      task.notDoneApproval = undefined;
      task.completedAt = null;
      await task.save();
      return { synced: true, missed };
    }
  }

  while (calendarDayKeyInTz(cursor) < todayKey) {
    // eslint-disable-next-line no-await-in-loop
    const rec = await recordMissedOccurrence({
      task,
      occurrenceDueDate: cursor,
      assigneeId: primaryAssignee,
      now,
    });
    if (rec && rec.status === "missed") missed += 1;

    const next = computeNextDueDate({ ...taskPlain, dueDate: cursor });
    if (!next) break;
    cursor = next;
  }

  const cursorKey = calendarDayKeyInTz(cursor);
  if (cursorKey >= todayKey) {
    task.dueDate = setDueDateToCalendarDay(cursor, cursorKey);
  } else {
    task.dueDate = setDueDateToCalendarDay(task.dueDate, todayKey);
  }
  task.status = "pending";
  task.approvalStatus = "none";
  task.submissionRemarks = "";
  task.notDoneApproval = undefined;
  task.completedAt = null;
  task.rejectionRemarks = "";
  task.rejectionMode = "";
  await task.save();

  await logActivity({
    actor: primaryAssignee,
    type: "task_occurrence_missed",
    message: `${task.title} advanced to today; ${missed} past occurrence(s) marked not done`,
    task: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    meta: { missed, todayKey },
  });

  return { synced: true, missed };
}

export async function syncRecurringTasksForAssignee(assigneeId, now = new Date()) {
  const tasks = await Task.find({
    deletedAt: null,
    assignees: assigneeId,
    taskType: { $in: RECURRING_TYPES },
    status: { $in: ["pending", "in_progress", "overdue", "awaiting_approval", "completed"] },
  });

  const concurrency = Math.min(8, Math.max(2, Number(process.env.RECURRING_SYNC_CONCURRENCY) || 4));
  let totalMissed = 0;
  let synced = 0;

  for (let i = 0; i < tasks.length; i += concurrency) {
    const chunk = tasks.slice(i, i + concurrency);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(
      chunk.map((task) => syncRecurringTaskToToday(task, { assigneeId, now }))
    );
    for (const result of results) {
      if (result.synced) synced += 1;
      totalMissed += result.missed || 0;
    }
  }

  return { synced, totalMissed };
}

/** Run occurrence sync for every assignee with recurring tasks (all centres / assigners). */
export async function syncAllAssigneesRecurringOccurrences(now = new Date()) {
  const assigneeIds = await Task.distinct("assignees", {
    deletedAt: null,
    taskType: { $in: RECURRING_TYPES },
  });

  let synced = 0;
  let totalMissed = 0;
  for (const assigneeId of assigneeIds) {
    // eslint-disable-next-line no-await-in-loop
    const result = await syncRecurringTasksForAssignee(assigneeId, now);
    synced += result.synced || 0;
    totalMissed += result.totalMissed || 0;
  }

  return { assignees: assigneeIds.length, synced, totalMissed };
}
