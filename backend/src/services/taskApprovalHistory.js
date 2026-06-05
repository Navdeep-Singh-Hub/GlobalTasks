import { TaskApprovalRecord } from "../models/TaskApprovalRecord.js";
import { Task } from "../models/Task.js";
import { TaskEvent } from "../models/TaskEvent.js";
import { APP_TIMEZONE, calendarDayKeyInTz, startOfNextCalendarDayInTz } from "../utils/recurrence.js";

export function taskAssignerIdFromDoc(task) {
  return String(task?.assignedBy?._id || task?.assignedBy || task?.createdBy?._id || task?.createdBy || "");
}

function dueDateDayBounds(d, timeZone = APP_TIMEZONE) {
  const key = calendarDayKeyInTz(d, timeZone);
  const start = new Date(`${key}T00:00:00+05:30`);
  const end = new Date(startOfNextCalendarDayInTz(start, timeZone));
  return { start, end, key };
}

function occurrenceDueOnDay(dueDate, dayKey, timeZone = APP_TIMEZONE) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(dueDate));
  return new Date(`${dayKey}T${time}+05:30`);
}

/** Pending submitted today cannot be for a future day (send-back used rolled-forward task.dueDate). */
export function correctMisdatedPendingOccurrence(records) {
  return records.map((r) => {
    if (r.status !== "pending" || r.kind === "not_done") return r;
    const subKey = calendarDayKeyInTz(r.submittedAt);
    const dueKey = calendarDayKeyInTz(r.occurrenceDueDate);
    if (!subKey || !dueKey || dueKey <= subKey) return r;
    return { ...r, occurrenceDueDate: occurrenceDueOnDay(r.occurrenceDueDate, subKey) };
  });
}

/** Assigner unapproves: flip the latest approved row back to pending (no duplicate row). */
export async function reopenApprovalForAssigner({ task, assigneeId, remarks, occurrenceDueDate }) {
  const assignedBy = taskAssignerIdFromDoc(task);
  if (!assignedBy || !assigneeId) return null;

  const query = {
    taskId: task._id,
    status: { $in: ["approved", "not_done_acknowledged"] },
  };
  if (occurrenceDueDate) {
    const { start, end } = dueDateDayBounds(occurrenceDueDate);
    query.occurrenceDueDate = { $gte: start, $lt: end };
  }

  const existing = await TaskApprovalRecord.findOne(query).sort({ approvedAt: -1, submittedAt: -1 });
  const text = String(remarks || "Reopened by assigner for re-approval.").trim();

  const resolveReopenOccurrenceDue = async () => {
    if (occurrenceDueDate) return occurrenceDueDate;
    if (existing?.occurrenceDueDate) return existing.occurrenceDueDate;
    const lastApproved = await TaskApprovalRecord.findOne({
      taskId: task._id,
      status: { $in: ["approved", "not_done_acknowledged"] },
    })
      .sort({ approvedAt: -1, submittedAt: -1 })
      .select("occurrenceDueDate")
      .lean();
    let due = lastApproved?.occurrenceDueDate || task.dueDate;
    const todayKey = calendarDayKeyInTz(new Date());
    if (calendarDayKeyInTz(due) > todayKey) {
      due = occurrenceDueOnDay(due, todayKey);
    }
    return due;
  };

  if (existing) {
    existing.status = "pending";
    existing.approvedAt = null;
    existing.approvedBy = null;
    existing.rejectedAt = null;
    existing.rejectedBy = null;
    existing.rejectionRemarks = "";
    existing.rejectionMode = "";
    existing.submittedAt = new Date();
    existing.submissionRemarks = text || existing.submissionRemarks;
    await existing.save();
    await TaskApprovalRecord.deleteMany({
      taskId: task._id,
      status: "pending",
      kind: "completion",
      _id: { $ne: existing._id },
    });
    return existing;
  }

  const resolvedDue = await resolveReopenOccurrenceDue();
  return TaskApprovalRecord.create({
    taskId: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    centerId: task.centerId || null,
    assignedBy,
    assigneeId,
    occurrenceDueDate: resolvedDue,
    submittedAt: new Date(),
    submissionRemarks: text,
    kind: "completion",
    status: "pending",
  });
}

/**
 * Daily recurring: reset today's occurrence to pending so assignee can redo and submit again.
 * Clears pending/approved completion records for today (removes from For Approval & performance).
 */
export async function resubmitDailyRecurringTask({ task }) {
  if (task.taskType !== "daily") {
    return { ok: false, message: "Resubmit is only available for daily recurring tasks" };
  }

  const todayBounds = dueDateDayBounds(new Date());
  const todayKey = todayBounds.key;

  const [pendingRecord, approvedRecord] = await Promise.all([
    TaskApprovalRecord.findOne({
      taskId: task._id,
      kind: "completion",
      status: "pending",
      occurrenceDueDate: { $gte: todayBounds.start, $lt: todayBounds.end },
    })
      .sort({ submittedAt: -1 })
      .lean(),
    TaskApprovalRecord.findOne({
      taskId: task._id,
      kind: "completion",
      status: "approved",
      occurrenceDueDate: { $gte: todayBounds.start, $lt: todayBounds.end },
    })
      .sort({ approvedAt: -1, submittedAt: -1 })
      .lean(),
  ]);

  const awaiting =
    task.status === "awaiting_approval" &&
    task.approvalStatus === "pending" &&
    !task.notDoneApproval?.status;
  const completedApproved =
    task.status === "completed" && (task.approvalStatus === "approved" || Boolean(approvedRecord));

  if (!awaiting && !completedApproved && !pendingRecord && !approvedRecord) {
    return { ok: false, message: "This task cannot be resubmitted" };
  }

  let occurrenceDue =
    pendingRecord?.occurrenceDueDate || approvedRecord?.occurrenceDueDate || task.dueDate;
  if (calendarDayKeyInTz(occurrenceDue) !== todayKey) {
    if (pendingRecord || approvedRecord || isOccurrenceDueToday(task.dueDate)) {
      occurrenceDue = occurrenceDueOnDay(occurrenceDue, todayKey);
    } else {
      return { ok: false, message: "You can only resubmit today's daily occurrence" };
    }
  }

  await TaskApprovalRecord.deleteMany({
    taskId: task._id,
    kind: "completion",
    occurrenceDueDate: { $gte: todayBounds.start, $lt: todayBounds.end },
    status: { $in: ["pending", "approved"] },
  });

  task.status = "pending";
  task.approvalStatus = "none";
  task.requiresApproval = true;
  task.submissionRemarks = "";
  task.completedAt = null;
  task.rejectionRemarks = "";
  task.rejectionMode = "";
  task.notDoneApproval = undefined;
  task.dueDate = occurrenceDue;
  await task.save();

  return { ok: true, occurrenceDueDate: occurrenceDue };
}

function isOccurrenceDueToday(dueDate, now = new Date(), timeZone = APP_TIMEZONE) {
  if (!dueDate) return false;
  return calendarDayKeyInTz(dueDate, timeZone) === calendarDayKeyInTz(now, timeZone);
}

export async function recordTaskSubmission({ task, assigneeId, remarks, kind = "completion" }) {
  const assignedBy = taskAssignerIdFromDoc(task);
  if (!assignedBy || !assigneeId) return null;
  return TaskApprovalRecord.create({
    taskId: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    centerId: task.centerId || null,
    assignedBy,
    assigneeId,
    occurrenceDueDate: task.dueDate,
    submittedAt: new Date(),
    submissionRemarks: String(remarks || "").trim(),
    kind,
    status: "pending",
  });
}

export async function finalizeApprovalRecord({ task, occurrenceDueDate, approverId, status, extra = {} }) {
  const due = occurrenceDueDate || task.dueDate;
  const update = {
    status,
    ...extra,
  };
  if (status === "approved") {
    update.approvedAt = extra.approvedAt || new Date();
    update.approvedBy = approverId;
  }
  if (status === "rejected") {
    update.rejectedAt = extra.rejectedAt || new Date();
    update.rejectedBy = approverId;
  }
  if (status === "not_done_acknowledged") {
    update.approvedAt = extra.approvedAt || new Date();
    update.approvedBy = approverId;
  }

  const { start, end } = dueDateDayBounds(due);
  const record = await TaskApprovalRecord.findOneAndUpdate(
    {
      taskId: task._id,
      occurrenceDueDate: { $gte: start, $lt: end },
      status: "pending",
    },
    { $set: update },
    { sort: { submittedAt: -1 }, new: true }
  );

  if (record) return record;

  return TaskApprovalRecord.create({
    taskId: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    centerId: task.centerId || null,
    assignedBy: taskAssignerIdFromDoc(task),
    assigneeId: (task.assignees || [])[0] || null,
    occurrenceDueDate: due,
    submittedAt: extra.submittedAt || task.updatedAt || new Date(),
    submissionRemarks: task.submissionRemarks || "",
    kind: extra.kind || "completion",
    status,
    approvedAt: update.approvedAt || null,
    approvedBy: update.approvedBy || null,
    rejectedAt: update.rejectedAt || null,
    rejectedBy: update.rejectedBy || null,
    rejectionRemarks: extra.rejectionRemarks || "",
    rejectionMode: extra.rejectionMode || "",
  });
}

export async function recordNotDoneSubmission({ task, assigneeId, remarks, occurrenceDueDate }) {
  const assignedBy = taskAssignerIdFromDoc(task);
  if (!assignedBy || !assigneeId) return null;
  return TaskApprovalRecord.create({
    taskId: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    centerId: task.centerId || null,
    assignedBy,
    assigneeId,
    occurrenceDueDate: occurrenceDueDate || task.dueDate,
    submittedAt: new Date(),
    submissionRemarks: String(remarks || "").trim(),
    kind: "not_done",
    status: "pending",
  });
}

export function assignerScopeClause(userId) {
  return {
    $or: [
      { assignedBy: userId },
      { assignedBy: null, createdBy: userId },
      { assignedBy: { $exists: false }, createdBy: userId },
    ],
  };
}

/**
 * Everyone this user has ever assigned a task to (active + deleted tasks, plus approval history).
 */
export async function listMyAssignees({ userId, centerId, isCeoRole }) {
  if (isCeoRole) {
    const [fromTasks, fromHistory] = await Promise.all([
      Task.distinct("assignees", { deletedAt: null }),
      TaskApprovalRecord.distinct("assigneeId", {}),
    ]);
    const ids = new Set(
      [...fromTasks, ...fromHistory].map((id) => String(id)).filter(Boolean)
    );
    return [...ids];
  }

  const assignerFilter = assignerScopeClause(userId);
  const taskFilter = { ...assignerFilter };
  if (centerId) taskFilter.centerId = centerId;

  const historyFilter = { assignedBy: userId };
  if (centerId) historyFilter.centerId = centerId;

  const [fromTasks, fromHistory, taskIdsForHistory] = await Promise.all([
    Task.distinct("assignees", taskFilter),
    TaskApprovalRecord.distinct("assigneeId", historyFilter),
    Task.distinct("_id", taskFilter),
  ]);

  const historyByTask =
    taskIdsForHistory.length > 0
      ? await TaskApprovalRecord.distinct("assigneeId", { taskId: { $in: taskIdsForHistory } })
      : [];

  const ids = new Set(
    [...fromTasks, ...fromHistory, ...historyByTask].map((id) => String(id)).filter(Boolean)
  );
  return [...ids];
}

/** Match history for tasks you assigned even if record.assignedBy was stored before backfill. */
export async function buildAssigneeHistoryQuery({ userId, assigneeId, centerId, isCeoRole, from, to }) {
  let q = { assigneeId };

  if (!isCeoRole) {
    const taskFilter = {
      deletedAt: null,
      assignees: assigneeId,
      ...assignerScopeClause(userId),
    };
    if (centerId) taskFilter.centerId = centerId;
    const taskIds = await Task.distinct("_id", taskFilter);
    q = {
      assigneeId,
      $or: [{ assignedBy: userId }, { taskId: { $in: taskIds } }],
    };
  }
  if (from || to) {
    q.submittedAt = {};
    if (from) q.submittedAt.$gte = new Date(String(from));
    if (to) {
      const end = new Date(String(to));
      end.setHours(23, 59, 59, 999);
      q.submittedAt.$lte = end;
    }
  }
  return q;
}

function occurrenceDayKey(d) {
  if (!d) return "";
  return calendarDayKeyInTz(d);
}

function approvalRecordPriority(r) {
  if (r.status === "pending") return 4;
  if (r.status === "approved" || r.status === "not_done_acknowledged") return 3;
  if (r.status === "rejected") return 2;
  if (r.status === "missed") return 1;
  return 0;
}

function pickPreferredApprovalRecord(prev, r) {
  const pp = approvalRecordPriority(prev);
  const rp = approvalRecordPriority(r);
  if (rp > pp) return r;
  if (rp < pp) return prev;
  if (prev.live && !r.live) return r;
  if (!prev.live && r.live) return prev;
  return new Date(r.submittedAt) > new Date(prev.submittedAt) ? r : prev;
}

/** One row per task occurrence; pending wins over approved when assigner reopened. */
export function dedupeApprovalRecords(records) {
  const byKey = new Map();
  for (const r of records) {
    const key = `${String(r.taskId || "")}-${occurrenceDayKey(r.occurrenceDueDate)}`;
    const prev = byKey.get(key);
    byKey.set(key, prev ? pickPreferredApprovalRecord(prev, r) : r);
  }
  return [...byKey.values()].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/** Keep only the newest pending row per task (drops orphan 6/6 rows after reopen on 5/6). */
export function pruneDuplicatePendingPerTask(records) {
  const latestPendingByTask = new Map();
  for (const r of records) {
    if (r.status !== "pending") continue;
    const tid = String(r.taskId || "");
    if (!tid) continue;
    const prev = latestPendingByTask.get(tid);
    if (!prev || new Date(r.submittedAt).getTime() > new Date(prev.submittedAt).getTime()) {
      latestPendingByTask.set(tid, r);
    }
  }
  if (!latestPendingByTask.size) return records;
  return records.filter((r) => {
    if (r.status !== "pending") return true;
    const tid = String(r.taskId || "");
    const latest = latestPendingByTask.get(tid);
    return latest && String(r._id) === String(latest._id);
  });
}

/**
 * After send-back, hide the latest approved row for a task when a newer pending exists
 * (fixes legacy duplicate rows: approved 5/6 + waiting 6/6 for the same reopen).
 */
export function collapseReopenedDuplicates(records) {
  const byTask = new Map();
  for (const r of records) {
    const tid = String(r.taskId || "");
    if (!tid) continue;
    if (!byTask.has(tid)) byTask.set(tid, []);
    byTask.get(tid).push(r);
  }

  const kept = [];
  for (const rows of byTask.values()) {
    const pending = rows
      .filter((r) => r.status === "pending")
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    if (!pending.length) {
      kept.push(...rows);
      continue;
    }
    const latestPendingAt = new Date(pending[0].submittedAt).getTime();
    const approved = rows
      .filter((r) => r.status === "approved" || r.status === "not_done_acknowledged")
      .sort(
        (a, b) =>
          new Date(b.approvedAt || b.submittedAt).getTime() -
          new Date(a.approvedAt || a.submittedAt).getTime()
      );
    const supersededApprovedId =
      approved[0] &&
      new Date(approved[0].approvedAt || approved[0].submittedAt).getTime() < latestPendingAt
        ? String(approved[0]._id)
        : null;

    for (const r of rows) {
      if (supersededApprovedId && String(r._id) === supersededApprovedId) continue;
      kept.push(r);
    }
  }

  return kept.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

/** Tasks currently waiting in For Approval (includes rows without a history record yet). */
export async function fetchLivePendingApprovals({ userId, assigneeId, centerId, isCeoRole, from, to }) {
  const taskFilter = {
    deletedAt: null,
    assignees: assigneeId,
    $and: [
      {
        $or: [
          { status: "awaiting_approval", approvalStatus: "pending" },
          { requiresApproval: true, approvalStatus: "pending", status: "awaiting_approval" },
          { "notDoneApproval.status": "pending" },
        ],
      },
    ],
  };
  if (!isCeoRole) {
    taskFilter.$and.push(assignerScopeClause(userId));
    if (centerId) taskFilter.centerId = centerId;
  }

  const tasks = await Task.find(taskFilter)
    .select("_id title taskType dueDate submissionRemarks updatedAt notDoneApproval")
    .lean();

  const taskIds = tasks.map((t) => t._id);
  const storedPendingRows =
    taskIds.length > 0
      ? await TaskApprovalRecord.find({
          taskId: { $in: taskIds },
          status: "pending",
          kind: "completion",
        })
          .sort({ submittedAt: -1 })
          .lean()
      : [];
  const pendingByTask = new Map();
  for (const p of storedPendingRows) {
    const tid = String(p.taskId);
    if (!pendingByTask.has(tid)) pendingByTask.set(tid, p);
  }

  const rows = [];
  for (const t of tasks) {
    const isNotDone = t.notDoneApproval?.status === "pending";
    const storedPending = pendingByTask.get(String(t._id));
    let submittedAt = isNotDone ? t.notDoneApproval?.submittedAt || t.updatedAt : t.updatedAt;
    let occurrenceDueDate = isNotDone ? t.notDoneApproval?.dueDate || t.dueDate : t.dueDate;
    let remarks = isNotDone ? t.notDoneApproval?.remarks : t.submissionRemarks;
    if (!isNotDone && storedPending) {
      submittedAt = storedPending.submittedAt;
      occurrenceDueDate = storedPending.occurrenceDueDate;
      remarks = storedPending.submissionRemarks;
    }

    if (from || to) {
      const sub = new Date(submittedAt);
      if (from && sub < new Date(String(from))) continue;
      if (to) {
        const end = new Date(String(to));
        end.setHours(23, 59, 59, 999);
        if (sub > end) continue;
      }
    }

    rows.push({
      _id: `live-${t._id}-${occurrenceDayKey(occurrenceDueDate)}`,
      taskId: t._id,
      taskTitle: t.title,
      taskType: t.taskType,
      occurrenceDueDate,
      submittedAt,
      submissionRemarks: String(remarks || "").trim(),
      status: "pending",
      kind: isNotDone ? "not_done" : "completion",
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      live: true,
    });
  }
  return rows;
}

export function mergeAssigneeApprovalRows(records, livePending) {
  const covered = new Set(
    records.map((r) => `${String(r.taskId)}-${occurrenceDayKey(r.occurrenceDueDate)}`)
  );
  const tasksWithStoredPending = new Set(
    records.filter((r) => r.status === "pending").map((r) => String(r.taskId))
  );
  const extra = livePending.filter((p) => {
    const tid = String(p.taskId);
    if (tasksWithStoredPending.has(tid)) return false;
    return !covered.has(`${tid}-${occurrenceDayKey(p.occurrenceDueDate)}`);
  });
  return [...extra, ...records].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/** Rebuild approval rows from TaskEvent (approved / rejected / submit via awaiting_approval). */
export async function backfillApprovalRecordsFromEvents() {
  const tasks = await Task.find({
    deletedAt: null,
    $or: [{ requiresApproval: true }, { approvalStatus: { $in: ["approved", "rejected", "pending"] } }],
  })
    .select("_id title taskType centerId assignees assignedBy createdBy dueDate submissionRemarks")
    .lean();
  const taskMap = new Map(tasks.map((t) => [String(t._id), t]));
  if (!tasks.length) return { created: 0, skipped: 0 };

  const events = await TaskEvent.find({
    taskId: { $in: tasks.map((t) => t._id) },
    eventType: { $in: ["updated", "approved", "rejected"] },
  })
    .sort({ createdAt: 1 })
    .lean();

  let created = 0;
  let skipped = 0;
  const pendingSubmit = new Map();

  for (const e of events) {
    const task = taskMap.get(String(e.taskId));
    if (!task) continue;
    const tid = String(e.taskId);

    if (e.eventType === "updated" && e.meta?.status === "awaiting_approval") {
      pendingSubmit.set(tid, {
        submittedAt: e.createdAt,
        assigneeId: e.actorId || task.assignees?.[0],
        occurrenceDueDate: task.dueDate,
        remarks: task.submissionRemarks || "",
      });
      continue;
    }

    if (e.eventType !== "approved" && e.eventType !== "rejected") continue;

    const pending = pendingSubmit.get(tid);
    const assigneeId = pending?.assigneeId || task.assignees?.[0];
    const assignedBy = taskAssignerIdFromDoc(task);
    if (!assigneeId || !assignedBy) {
      skipped += 1;
      continue;
    }

    const occurrenceDueDate = e.meta?.occurrenceDueDate || pending?.occurrenceDueDate || task.dueDate;
    const submittedAt = pending?.submittedAt || e.createdAt;
    const status = e.eventType === "approved" ? "approved" : "rejected";

    const exists = await TaskApprovalRecord.findOne({
      taskId: e.taskId,
      assigneeId,
      occurrenceDueDate,
      status,
      $or: [{ approvedAt: e.createdAt }, { rejectedAt: e.createdAt }],
    }).lean();
    if (exists) {
      skipped += 1;
      pendingSubmit.delete(tid);
      continue;
    }

    await TaskApprovalRecord.create({
      taskId: e.taskId,
      taskTitle: task.title,
      taskType: task.taskType,
      centerId: task.centerId || null,
      assignedBy,
      assigneeId,
      occurrenceDueDate,
      submittedAt,
      submissionRemarks: String(pending?.remarks || "").trim(),
      kind: "completion",
      status,
      approvedAt: e.eventType === "approved" ? e.createdAt : null,
      approvedBy: e.eventType === "approved" ? e.actorId : null,
      rejectedAt: e.eventType === "rejected" ? e.createdAt : null,
      rejectedBy: e.eventType === "rejected" ? e.actorId : null,
      rejectionRemarks: String(e.meta?.remarks || ""),
      rejectionMode: String(e.meta?.mode || ""),
    });
    created += 1;
    pendingSubmit.delete(tid);
  }

  let repaired = 0;
  const allRecords = await TaskApprovalRecord.find({}).select("taskId assignedBy").lean();
  for (const r of allRecords) {
    const task = taskMap.get(String(r.taskId));
    if (!task) continue;
    const assigner = taskAssignerIdFromDoc(task);
    if (assigner && String(r.assignedBy) !== assigner) {
      await TaskApprovalRecord.updateOne({ _id: r._id }, { $set: { assignedBy: assigner } });
      repaired += 1;
    }
  }

  return { created, skipped, repaired };
}
