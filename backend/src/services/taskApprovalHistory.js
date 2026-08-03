import { TaskApprovalRecord } from "../models/TaskApprovalRecord.js";
import { Task } from "../models/Task.js";
import { TaskEvent } from "../models/TaskEvent.js";
import { APP_TIMEZONE, calendarDayKeyInTz, startOfNextCalendarDayInTz, isRecurring, isOccurrencePastDue, resolveOccurrenceDueForSubmitTime } from "../utils/recurrence.js";

export function taskAssignerIdFromDoc(task) {
  return String(task?.assignedBy?._id || task?.assignedBy || task?.createdBy?._id || task?.createdBy || "");
}

/**
 * Shared multi-assignee task: ensure `assigneeId` has a solo task they can submit on.
 * - If nobody else has approval history on this task: keep this doc for them, clone open copies for others.
 * - If someone else already submitted: spawn a fresh open task for this person and remove them from original.
 * Mutates `task` assignees when keeping original; returns the task document the caller should save/submit on.
 */
export async function claimSharedTaskForAssignee(task, assigneeId, { actorId } = {}) {
  const aid = String(assigneeId || "");
  if (!task || !aid) return { workingTask: task, clones: [] };

  const allIds = (task.assignees || []).map((id) => String(id?._id || id)).filter(Boolean);
  const others = allIds.filter((id) => id !== aid);
  if (!others.length) return { workingTask: task, clones: [] };

  const foreign = await TaskApprovalRecord.findOne({
    taskId: task._id,
    assigneeId: { $ne: aid },
    status: { $in: ["pending", "approved", "not_done_acknowledged", "rejected", "missed"] },
  })
    .select("_id assigneeId status")
    .lean();

  const plain = typeof task.toObject === "function" ? task.toObject() : { ...task };
  const {
    _id,
    __v,
    createdAt,
    updatedAt,
    taskIdDisplay,
    submissionRemarks,
    completedAt,
    notDoneApproval,
    rejectionRemarks,
    rejectionMode,
    approvalStatus,
    status,
    ...rest
  } = plain;

  const openStatus = ["pending", "in_progress", "overdue"].includes(status) ? status : "pending";
  const baseClonePayload = () => ({
    ...rest,
    status: openStatus,
    approvalStatus: "none",
    submissionRemarks: "",
    completedAt: null,
    notDoneApproval: undefined,
    rejectionRemarks: "",
    rejectionMode: "",
    inputPayload: rest.inputPayload && typeof rest.inputPayload === "object" ? { ...rest.inputPayload } : {},
    attachments: Array.isArray(rest.attachments) ? rest.attachments.map((a) => ({ ...a })) : [],
    tags: Array.isArray(rest.tags) ? [...rest.tags] : [],
  });

  // Another assignee already progressed this shared document — give me my own copy.
  if (foreign) {
    const mine = await Task.create({
      ...baseClonePayload(),
      assignees: [aid],
    });
    await TaskEvent.create({
      taskId: mine._id,
      actorId: actorId || assigneeId,
      eventType: "created",
      meta: { splitFrom: String(task._id), forAssignee: aid, reason: "foreign_progress" },
    });
    task.assignees = others;
    return { workingTask: mine, clones: [mine], removedSelfFromOriginal: true };
  }

  // No foreign history — I claim the original; others get open clones.
  const clones = [];
  for (const otherId of others) {
    // eslint-disable-next-line no-await-in-loop
    const clone = await Task.create({
      ...baseClonePayload(),
      assignees: [otherId],
    });
    // eslint-disable-next-line no-await-in-loop
    await TaskEvent.create({
      taskId: clone._id,
      actorId: actorId || assigneeId,
      eventType: "created",
      meta: { splitFrom: String(task._id), forAssignee: otherId, reason: "claim_original" },
    });
    clones.push(clone);
  }

  task.assignees = [aid];
  return { workingTask: task, clones, removedSelfFromOriginal: false };
}

function taskIdsEqual(a, b) {
  return String(a || "") === String(b || "");
}

function buildClonePayloadFromTask(task) {
  const plain = typeof task.toObject === "function" ? task.toObject() : { ...task };
  const {
    _id,
    __v,
    createdAt,
    updatedAt,
    taskIdDisplay,
    submissionRemarks,
    completedAt,
    notDoneApproval,
    rejectionRemarks,
    rejectionMode,
    approvalStatus,
    status,
    assignees,
    ...rest
  } = plain;
  const openStatus = ["pending", "in_progress", "overdue"].includes(status) ? status : "pending";
  return {
    ...rest,
    status: openStatus,
    approvalStatus: "none",
    submissionRemarks: "",
    completedAt: null,
    notDoneApproval: undefined,
    rejectionRemarks: "",
    rejectionMode: "",
    inputPayload: rest.inputPayload && typeof rest.inputPayload === "object" ? { ...rest.inputPayload } : {},
    attachments: Array.isArray(rest.attachments) ? rest.attachments.map((a) => ({ ...a })) : [],
    tags: Array.isArray(rest.tags) ? [...rest.tags] : [],
  };
}

async function findExistingSplitClone(sourceTaskId, assigneeId) {
  const ev = await TaskEvent.findOne({
    eventType: "created",
    "meta.splitFrom": String(sourceTaskId),
    "meta.forAssignee": String(assigneeId),
  })
    .select("taskId")
    .lean();
  if (!ev?.taskId) return null;
  return Task.findOne({ _id: ev.taskId, deletedAt: null });
}

/** Move this person's approval rows onto their solo task. */
async function rehomeAssigneeRecords(fromTaskId, toTaskId, assigneeId) {
  if (taskIdsEqual(fromTaskId, toTaskId)) return 0;
  const result = await TaskApprovalRecord.updateMany(
    { taskId: fromTaskId, assigneeId },
    { $set: { taskId: toTaskId } }
  );
  return result.modifiedCount || 0;
}

/**
 * Align solo task status with this assignee's approval rows (pending / completed / open).
 */
async function applyPersonalTaskStateFromRecords(task, assigneeId) {
  if (!task || !assigneeId) return;

  const pending = await TaskApprovalRecord.findOne({
    taskId: task._id,
    assigneeId,
    status: "pending",
    kind: { $in: ["completion", "not_done"] },
  })
    .sort({ submittedAt: -1 })
    .lean();

  if (pending) {
    task.status = "awaiting_approval";
    task.approvalStatus = "pending";
    task.requiresApproval = true;
    task.submissionRemarks = pending.submissionRemarks || "";
    task.completedAt = null;
    if (pending.kind === "not_done") {
      task.notDoneApproval = {
        dueDate: pending.occurrenceDueDate || task.dueDate,
        remarks: pending.submissionRemarks || "",
        submittedAt: pending.submittedAt || new Date(),
        submittedBy: assigneeId,
        status: "pending",
      };
    } else {
      task.notDoneApproval = undefined;
    }
    if (pending.occurrenceDueDate) task.dueDate = pending.occurrenceDueDate;
    await task.save();
    return;
  }

  const approved = await TaskApprovalRecord.findOne({
    taskId: task._id,
    assigneeId,
    status: { $in: ["approved", "not_done_acknowledged"] },
  })
    .sort({ approvedAt: -1, submittedAt: -1 })
    .lean();

  if (approved && !isRecurring(task.taskType)) {
    if (approved.status === "approved") {
      task.status = "completed";
      task.approvalStatus = "approved";
      task.completedAt = approved.approvedAt || approved.submittedAt || new Date();
    } else {
      task.status = "pending";
      task.approvalStatus = "none";
      task.completedAt = null;
    }
    task.submissionRemarks = "";
    task.notDoneApproval = undefined;
    await task.save();
    return;
  }

  // No personal pending: if task was shared awaiting for someone else, open it for this person.
  if (task.status === "awaiting_approval" || task.approvalStatus === "pending") {
    task.status = "pending";
    task.approvalStatus = "none";
    task.submissionRemarks = "";
    task.notDoneApproval = undefined;
    task.completedAt = null;
    await task.save();
  }
}

/**
 * Persist missed (not done) rows for past scheduled days so performance is complete.
 */
async function backfillMissedDbRowsForTaskAssignee(task, assigneeId) {
  const assignedBy = taskAssignerIdFromDoc(task);
  if (!assignedBy || !assigneeId || !task?._id) return 0;

  let created = 0;
  const todayKey = calendarDayKeyInTz(new Date());

  if (task.taskType === "daily") {
    let dayKey = calendarDayKeyInTz(task.createdAt || task.dueDate || new Date());
    while (dayKey < todayKey) {
      if (isDailyOccurrenceScheduled(task, dayKey)) {
        const dueDt = occurrenceDueOnDay(task.dueDate, dayKey);
        const { start, end } = dueDateDayBounds(dueDt);
        // eslint-disable-next-line no-await-in-loop
        const exists = await TaskApprovalRecord.findOne({
          taskId: task._id,
          assigneeId,
          occurrenceDueDate: { $gte: start, $lt: end },
        })
          .select("_id")
          .lean();
        if (!exists) {
          // eslint-disable-next-line no-await-in-loop
          await TaskApprovalRecord.create({
            taskId: task._id,
            taskTitle: task.title,
            taskType: task.taskType,
            centerId: task.centerId || null,
            assignedBy,
            assigneeId,
            occurrenceDueDate: dueDt,
            submittedAt: new Date(`${dayKey}T23:59:59+05:30`),
            submissionRemarks: GAP_MISSED_REMARKS,
            kind: "not_done",
            status: "missed",
            submissionSource: "shared_repair",
          });
          created += 1;
        }
      }
      dayKey = nextCalendarDayKey(dayKey);
    }
    return created;
  }

  // One-time / non-daily: past due with no personal outcome → not done (missed)
  if (task.dueDate && isOccurrencePastDue(task.dueDate) && !isRecurring(task.taskType)) {
    const { start, end } = dueDateDayBounds(task.dueDate);
    const exists = await TaskApprovalRecord.findOne({
      taskId: task._id,
      assigneeId,
      occurrenceDueDate: { $gte: start, $lt: end },
    })
      .select("_id")
      .lean();
    if (!exists) {
      await TaskApprovalRecord.create({
        taskId: task._id,
        taskTitle: task.title,
        taskType: task.taskType,
        centerId: task.centerId || null,
        assignedBy,
        assigneeId,
        occurrenceDueDate: task.dueDate,
        submittedAt: task.dueDate,
        submissionRemarks: GAP_MISSED_REMARKS,
        kind: "not_done",
        status: "missed",
        submissionSource: "shared_repair",
      });
      created += 1;
    }
  }

  return created;
}

/**
 * Permanently fan-out one shared multi-assignee task into solo tasks.
 * Keep original for the person who already submitted (pending), else first assignee.
 * Others get open clones + their history rows rehomed + missed backfill.
 */
export async function splitSharedTaskPermanently(taskDoc) {
  const task = taskDoc?.toObject ? taskDoc : await Task.findById(taskDoc?._id || taskDoc);
  if (!task || task.deletedAt) return { cloned: 0, rehomed: 0, missedRows: 0 };

  const assigneeIds = [
    ...new Set((task.assignees || []).map((id) => String(id?._id || id)).filter(Boolean)),
  ];

  // Also include people who only appear on approval history (removed from assignees earlier)
  const historyAssignees = (
    await TaskApprovalRecord.distinct("assigneeId", { taskId: task._id })
  ).map(String);
  const allPeople = [...new Set([...assigneeIds, ...historyAssignees])];

  if (allPeople.length <= 1) {
    if (allPeople[0]) {
      await applyPersonalTaskStateFromRecords(task, allPeople[0]);
      const missedRows = await backfillMissedDbRowsForTaskAssignee(task, allPeople[0]);
      return { cloned: 0, rehomed: 0, missedRows };
    }
    return { cloned: 0, rehomed: 0, missedRows: 0 };
  }

  const records = await TaskApprovalRecord.find({ taskId: task._id })
    .select("assigneeId status submittedAt kind")
    .sort({ submittedAt: -1 })
    .lean();

  let primary =
    records.find((r) => r.status === "pending")?.assigneeId ||
    records.find((r) => r.status === "approved" || r.status === "not_done_acknowledged")?.assigneeId ||
    assigneeIds[0] ||
    allPeople[0];
  primary = String(primary);

  // Prefer someone still listed if primary not in assignees
  if (!assigneeIds.includes(primary) && assigneeIds.length) {
    const pendingOnList = records.find(
      (r) => r.status === "pending" && assigneeIds.includes(String(r.assigneeId))
    );
    primary = pendingOnList ? String(pendingOnList.assigneeId) : assigneeIds[0];
  }

  let cloned = 0;
  let rehomed = 0;
  let missedRows = 0;
  const base = buildClonePayloadFromTask(task);

  for (const aid of allPeople) {
    if (aid === primary) continue;

    // eslint-disable-next-line no-await-in-loop
    let solo = await findExistingSplitClone(task._id, aid);
    if (!solo) {
      // eslint-disable-next-line no-await-in-loop
      solo = await Task.create({
        ...base,
        assignees: [aid],
      });
      // eslint-disable-next-line no-await-in-loop
      await TaskEvent.create({
        taskId: solo._id,
        actorId: taskAssignerIdFromDoc(task) || primary,
        eventType: "created",
        meta: {
          splitFrom: String(task._id),
          forAssignee: aid,
          reason: "repair_shared_multi",
        },
      });
      cloned += 1;
    }

    // eslint-disable-next-line no-await-in-loop
    rehomed += await rehomeAssigneeRecords(task._id, solo._id, aid);
    // eslint-disable-next-line no-await-in-loop
    await applyPersonalTaskStateFromRecords(solo, aid);
    // eslint-disable-next-line no-await-in-loop
    missedRows += await backfillMissedDbRowsForTaskAssignee(solo, aid);
  }

  task.assignees = [primary];
  await task.save();
  await applyPersonalTaskStateFromRecords(task, primary);
  missedRows += await backfillMissedDbRowsForTaskAssignee(task, primary);

  return { cloned, rehomed, missedRows, primary };
}

/**
 * Restore inbox + performance after shared multi-assignee damage for one person (and their shared peers).
 */
export async function repairSharedMultiAssigneeForAssignee(assigneeId) {
  const aid = String(assigneeId || "");
  if (!aid) return { tasksHealed: 0, cloned: 0, rehomed: 0, missedRows: 0 };

  try {
    const multiIds = await Task.distinct("_id", {
      deletedAt: null,
      assignees: aid,
      "assignees.1": { $exists: true },
    });

    const recordTaskIds = await TaskApprovalRecord.distinct("taskId", { assigneeId: aid });
    const orphanByNin = recordTaskIds.length
      ? await Task.distinct("_id", {
          _id: { $in: recordTaskIds },
          deletedAt: null,
          assignees: { $nin: [aid] },
        })
      : [];

    // Tasks that still have multiple people's records (capped, only involving this assignee)
    const multiRecordForAssignee = recordTaskIds.length
      ? (
          await TaskApprovalRecord.aggregate([
            { $match: { taskId: { $in: recordTaskIds } } },
            { $group: { _id: "$taskId", people: { $addToSet: "$assigneeId" } } },
            { $match: { "people.1": { $exists: true } } },
            { $limit: 100 },
          ])
        ).map((g) => g._id)
      : [];

    const allTaskIds = [
      ...new Set([...multiIds, ...orphanByNin, ...multiRecordForAssignee].map((id) => String(id))),
    ].slice(0, 80);

    let tasksHealed = 0;
    let cloned = 0;
    let rehomed = 0;
    let missedRows = 0;

    for (const tid of allTaskIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const task = await Task.findById(tid);
        if (!task || task.deletedAt) continue;
        // eslint-disable-next-line no-await-in-loop
        const result = await splitSharedTaskPermanently(task);
        tasksHealed += 1;
        cloned += result.cloned || 0;
        rehomed += result.rehomed || 0;
        missedRows += result.missedRows || 0;
      } catch (e) {
        console.error("[repair-shared] task failed:", tid, e?.message || e);
      }
    }

    // Light missed backfill only for currently assigned solo tasks (small limit).
    const assignedTasks = await Task.find({
      deletedAt: null,
      assignees: aid,
    })
      .select("_id title taskType createdAt dueDate recurrence centerId assignedBy createdBy assignees")
      .limit(80);

    const soloTasks = assignedTasks.filter((t) => (t.assignees || []).length === 1);

    for (const t of soloTasks) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await applyPersonalTaskStateFromRecords(t, aid);
        // eslint-disable-next-line no-await-in-loop
        missedRows += await backfillMissedDbRowsForTaskAssignee(t, aid);
      } catch (e) {
        console.error("[repair-shared] solo backfill failed:", t?._id, e?.message || e);
      }
    }

    return { tasksHealed, cloned, rehomed, missedRows, orphanIds: orphanByNin.length };
  } catch (e) {
    console.error("[repair-shared] for assignee failed:", aid, e?.message || e);
    return { tasksHealed: 0, cloned: 0, rehomed: 0, missedRows: 0, error: e?.message || String(e) };
  }
}

/**
 * Org-wide heal for every multi-assignee task and multi-person approval-record task.
 */
export async function repairAllSharedMultiAssigneeTasks() {
  try {
    const multiTasks = await Task.find({
      deletedAt: null,
      "assignees.1": { $exists: true },
    })
      .select("_id")
      .limit(200)
      .lean();

    const multiRecordGroups = await TaskApprovalRecord.aggregate([
      { $group: { _id: "$taskId", people: { $addToSet: "$assigneeId" } } },
      { $match: { "people.1": { $exists: true } } },
      { $limit: 200 },
    ]);

    const ids = [
      ...new Set([
        ...multiTasks.map((t) => String(t._id)),
        ...multiRecordGroups.map((g) => String(g._id)),
      ]),
    ].slice(0, 250);

    let tasksHealed = 0;
    let cloned = 0;
    let rehomed = 0;
    let missedRows = 0;

    for (const tid of ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const task = await Task.findById(tid);
        if (!task || task.deletedAt) continue;
        // eslint-disable-next-line no-await-in-loop
        const result = await splitSharedTaskPermanently(task);
        tasksHealed += 1;
        cloned += result.cloned || 0;
        rehomed += result.rehomed || 0;
        missedRows += result.missedRows || 0;
      } catch (e) {
        console.error("[repair-shared-all] task failed:", tid, e?.message || e);
      }
    }

    return { tasksHealed, cloned, rehomed, missedRows };
  } catch (e) {
    console.error("[repair-shared-all] failed:", e?.message || e);
    return { tasksHealed: 0, cloned: 0, rehomed: 0, missedRows: 0, error: e?.message || String(e) };
  }
}

/**
 * Personal open/work state for an assignee viewing a task.
 * Shared multi-assignee damage left many tasks stuck as awaiting_approval so Submit disappeared.
 * - If THIS user already has a pending approval row → they correctly wait (awaiting_approval).
 * - If not, they can still work: multi → response only; solo stuck → reopen and save.
 */
export async function resolvePersonalWorkTaskView(taskInput, userId) {
  if (!taskInput || !userId) return taskInput;
  const plain =
    typeof taskInput.toObject === "function" ? taskInput.toObject() : { ...taskInput };
  const uid = String(userId);
  const isAssignee = (plain.assignees || []).some((a) => String(a?._id || a) === uid);
  if (!isAssignee) {
    return { ...plain, personalWorkState: "viewer" };
  }

  const myPending = await TaskApprovalRecord.findOne({
    taskId: plain._id,
    assigneeId: uid,
    status: "pending",
    kind: { $in: ["completion", "not_done"] },
  })
    .select("_id kind submissionRemarks occurrenceDueDate")
    .lean();

  if (myPending) {
    return {
      ...plain,
      status: "awaiting_approval",
      approvalStatus: "pending",
      personalWorkState: "submitted",
      personalPendingKind: myPending.kind,
    };
  }

  const blocked =
    plain.status === "awaiting_approval" ||
    plain.approvalStatus === "pending" ||
    plain.notDoneApproval?.status === "pending";

  if (!blocked) {
    return { ...plain, personalWorkState: "open" };
  }

  const multi = (plain.assignees || []).length > 1;

  // Solo task wrongly stuck awaiting / pending with no personal submission → reopen so submit works.
  if (!multi && typeof taskInput.save === "function") {
    taskInput.status = "pending";
    taskInput.approvalStatus = "none";
    taskInput.submissionRemarks = "";
    taskInput.notDoneApproval = undefined;
    taskInput.completedAt = null;
    try {
      await taskInput.save();
    } catch (e) {
      console.error("[personal-work] reopen stuck task failed:", plain._id, e?.message || e);
    }
    const refreshed =
      typeof taskInput.toObject === "function" ? taskInput.toObject() : { ...taskInput };
    return { ...refreshed, personalWorkState: "open", unstuck: true };
  }

  // Multi-assignee: don't rewrite shared state for others; give this person an open personal view.
  return {
    ...plain,
    status: plain.status === "overdue" ? "overdue" : "pending",
    approvalStatus: "none",
    submissionRemarks: "",
    notDoneApproval: undefined,
    personalWorkState: "open",
    sharedTaskAwaitingOthers: multi,
  };
}

/**
 * Assignee open inbox: keep shared multi-assignee tasks visible for people who have not yet
 * submitted this occurrence, even if task.status is already awaiting_approval (legacy rows).
 */
export async function filterAssigneePersonalOpenTasks(tasks, userId) {
  if (!tasks?.length || !userId) return tasks || [];
  const uid = String(userId);
  const openStatuses = new Set(["pending", "in_progress", "overdue"]);
  const alwaysShow = [];
  const awaiting = [];

  for (const t of tasks) {
    const isAssignee = (t.assignees || []).some((a) => String(a?._id || a) === uid);
    if (!isAssignee) continue;
    if (openStatuses.has(t.status)) alwaysShow.push(t);
    else if (t.status === "awaiting_approval" || t.approvalStatus === "pending") awaiting.push(t);
  }

  if (!awaiting.length) return alwaysShow;

  const taskIds = awaiting.map((t) => t._id);
  const myRecords = await TaskApprovalRecord.find({
    taskId: { $in: taskIds },
    assigneeId: uid,
    status: { $in: ["pending", "approved", "not_done_acknowledged", "rejected", "missed"] },
    kind: { $in: ["completion", "not_done"] },
  })
    .select("taskId status kind")
    .lean();

  const mineByTask = new Map();
  for (const r of myRecords) {
    const tid = String(r.taskId);
    const list = mineByTask.get(tid) || [];
    list.push(r);
    mineByTask.set(tid, list);
  }

  const stillOpen = [];
  for (const t of awaiting) {
    const mine = mineByTask.get(String(t._id)) || [];
    const multi = (t.assignees || []).length > 1;
    const hasActivePending = mine.some((r) => r.status === "pending");
    const hasTerminal = mine.some((r) =>
      ["approved", "not_done_acknowledged", "rejected", "missed"].includes(r.status)
    );
    if (hasActivePending || hasTerminal) continue;
    if (!multi) continue;
    stillOpen.push({ ...t, status: "pending", approvalStatus: "none" });
  }

  return [...alwaysShow, ...stillOpen];
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

/** Correct pending occurrence to the submit day for daily tasks (fixes rolled-forward due dates). */
export function effectivePendingOccurrenceDue(pending, task) {
  if (pending?.occurrenceDueDate) {
    if (pending.kind === "not_done") return pending.occurrenceDueDate;
    if (task?.taskType === "daily") {
      const subKey = calendarDayKeyInTz(pending.submittedAt);
      const dueKey = calendarDayKeyInTz(pending.occurrenceDueDate);
      if (subKey && dueKey && dueKey !== subKey) {
        return occurrenceDueOnDay(pending.occurrenceDueDate, subKey);
      }
    }
    return pending.occurrenceDueDate;
  }
  if (task?.notDoneApproval?.status === "pending" && task.notDoneApproval?.dueDate) {
    return task.notDoneApproval.dueDate;
  }
  return task?.dueDate || null;
}

export const AUTO_MISSED_REMARKS =
  "Not completed before the day ended — marked as not done automatically.";
export const AUTO_MISSED_DUE_TIME_REMARKS =
  "Not completed before the due time — marked as not done automatically.";
export const GAP_MISSED_REMARKS = "No submission recorded for this day.";

export function autoMissedRemarksForOccurrence(occurrenceDueDate, now = new Date()) {
  const occKey = calendarDayKeyInTz(occurrenceDueDate);
  const todayKey = calendarDayKeyInTz(now);
  if (occKey === todayKey && isOccurrencePastDue(occurrenceDueDate, now)) {
    return AUTO_MISSED_DUE_TIME_REMARKS;
  }
  return AUTO_MISSED_REMARKS;
}

export function isAutoMissedRemarks(text) {
  const t = String(text || "").trim();
  return (
    t === AUTO_MISSED_REMARKS ||
    t === AUTO_MISSED_DUE_TIME_REMARKS ||
    t === GAP_MISSED_REMARKS ||
    t.startsWith("Submitted for approval but the day ended") ||
    t.startsWith("Submitted for approval but the due time passed")
  );
}

export function isWronglyAutoMissedSubmissionRemarks(text) {
  const t = String(text || "").trim();
  return (
    t.startsWith("Submitted for approval but the day ended") ||
    t.startsWith("Submitted for approval but the due time passed")
  );
}

async function occurrenceHasTerminalOutcome(taskId, occurrenceDueDate, excludeId = null) {
  const { start, end } = dueDateDayBounds(occurrenceDueDate);
  const base = {
    taskId,
    occurrenceDueDate: { $gte: start, $lt: end },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  };
  const terminal = await TaskApprovalRecord.findOne({
    ...base,
    status: { $in: ["approved", "rejected", "not_done_acknowledged"] },
  }).lean();
  if (terminal) return true;
  const pending = await TaskApprovalRecord.findOne({
    ...base,
    status: "pending",
    kind: "completion",
  }).lean();
  return Boolean(pending);
}

/** Submit event for this occurrence with no matching approve/reject outcome. */
async function findUnresolvedSubmitEvent(taskId, occurrenceDueDate, taskType) {
  const occKey = calendarDayKeyInTz(occurrenceDueDate);
  const submitEvents = await TaskEvent.find({
    taskId,
    eventType: "updated",
    "meta.status": "awaiting_approval",
  })
    .sort({ createdAt: 1 })
    .lean();

  for (const e of submitEvents) {
    const subKey = calendarDayKeyInTz(e.createdAt);
    if (taskType === "daily" && subKey !== occKey) continue;

    const { start, end } = dueDateDayBounds(occurrenceDueDate);
    const resolvedRecord = await TaskApprovalRecord.findOne({
      taskId,
      occurrenceDueDate: { $gte: start, $lt: end },
      status: { $in: ["approved", "rejected", "not_done_acknowledged"] },
    }).lean();
    if (resolvedRecord) continue;

    const terminalEvent = await TaskEvent.findOne({
      taskId,
      eventType: { $in: ["approved", "rejected"] },
      createdAt: { $gt: e.createdAt },
    })
      .sort({ createdAt: 1 })
      .lean();
    if (terminalEvent) {
      const termOcc = terminalEvent.meta?.occurrenceDueDate;
      if (termOcc && calendarDayKeyInTz(termOcc) === occKey) continue;
    }
    return e;
  }
  return null;
}

const RESTORED_SUBMISSION_REMARKS = "Submission restored — awaiting assigner approval.";

/**
 * Restore approval rows that were wrongly auto-marked not done after the calendar day changed,
 * even though the assignee had submitted for approval.
 */
export async function repairWronglyAutoMissedSubmissions({ assigneeId }) {
  const tasks = await Task.find({
    deletedAt: null,
    assignees: assigneeId,
    $or: [{ requiresApproval: true }, { approvalStatus: { $in: ["pending", "approved", "rejected"] } }],
  })
    .select("_id title taskType dueDate status approvalStatus requiresApproval")
    .lean();
  if (!tasks.length) return { restoredRecords: 0, restoredTasks: 0, skipped: 0 };

  const taskById = new Map(tasks.map((t) => [String(t._id), t]));
  const missedRows = await TaskApprovalRecord.find({
    taskId: { $in: tasks.map((t) => t._id) },
    assigneeId,
    status: "missed",
  }).sort({ submittedAt: -1 });

  let restoredRecords = 0;
  let restoredTasks = 0;
  let skipped = 0;
  const taskIdsRestored = new Set();

  for (const rec of missedRows) {
    const task = taskById.get(String(rec.taskId));
    if (!task) {
      skipped += 1;
      continue;
    }

    const explicitWrong = isWronglyAutoMissedSubmissionRemarks(rec.submissionRemarks);
    const submitEvent = await findUnresolvedSubmitEvent(task._id, rec.occurrenceDueDate, task.taskType);
    if (!explicitWrong && !submitEvent) {
      skipped += 1;
      continue;
    }

    if (await occurrenceHasTerminalOutcome(task._id, rec.occurrenceDueDate, rec._id)) {
      skipped += 1;
      continue;
    }

    const occKey = calendarDayKeyInTz(rec.occurrenceDueDate);
    const occurrenceDue = occurrenceDueOnDay(rec.occurrenceDueDate, occKey);
    const submittedAt = submitEvent?.createdAt || rec.submittedAt || occurrenceDue;
    const remarks = explicitWrong
      ? RESTORED_SUBMISSION_REMARKS
      : String(rec.submissionRemarks || "").trim() || RESTORED_SUBMISSION_REMARKS;

    await TaskApprovalRecord.updateOne(
      { _id: rec._id },
      {
        $set: {
          status: "pending",
          kind: "completion",
          occurrenceDueDate: occurrenceDue,
          submittedAt,
          submissionRemarks: remarks,
          submissionSource: rec.submissionSource || "assignee",
        },
      }
    );
    restoredRecords += 1;

    const tid = String(task._id);
    if (taskIdsRestored.has(tid) || ["completed", "cancelled"].includes(task.status)) continue;

    const taskDoc = await Task.findById(task._id);
    if (!taskDoc || taskDoc.deletedAt) continue;

    taskDoc.status = "awaiting_approval";
    taskDoc.approvalStatus = "pending";
    taskDoc.dueDate = occurrenceDue;
    taskDoc.submissionRemarks = remarks;
    taskDoc.completedAt = null;
    taskDoc.rejectionRemarks = "";
    taskDoc.rejectionMode = "";
    taskDoc.notDoneApproval = undefined;
    await taskDoc.save();
    taskIdsRestored.add(tid);
    restoredTasks += 1;
  }

  return { restoredRecords, restoredTasks, skipped };
}

/** Convert stale pending to missed on the correct past day, or delete if today/future/duplicate. */
export async function finalizePendingAsAutoMissed(pendingDoc, task, { now = new Date() } = {}) {
  if (!pendingDoc?._id) return "skipped";
  if (pendingDoc.kind === "not_done") return "skipped";
  const todayKey = calendarDayKeyInTz(now);
  const effectiveDue = effectivePendingOccurrenceDue(pendingDoc, task);
  const occKey = calendarDayKeyInTz(effectiveDue);
  if (!occKey || occKey > todayKey) {
    await TaskApprovalRecord.deleteOne({ _id: pendingDoc._id });
    return "deleted";
  }
  if (occKey === todayKey && task?.taskType === "daily") {
    return "skipped";
  }
  if (occKey === todayKey && !isOccurrencePastDue(effectiveDue, now)) {
    await TaskApprovalRecord.deleteOne({ _id: pendingDoc._id });
    return "deleted";
  }

  const { start, end } = dueDateDayBounds(effectiveDue);
  const approved = await TaskApprovalRecord.findOne({
    taskId: pendingDoc.taskId,
    status: { $in: ["approved", "not_done_acknowledged"] },
    occurrenceDueDate: { $gte: start, $lt: end },
    _id: { $ne: pendingDoc._id },
  }).lean();
  if (approved) {
    await TaskApprovalRecord.deleteOne({ _id: pendingDoc._id });
    return "deleted";
  }

  const pending = await TaskApprovalRecord.findById(pendingDoc._id);
  if (!pending) return "skipped";
  pending.status = "missed";
  pending.kind = "not_done";
  pending.occurrenceDueDate = occurrenceDueOnDay(effectiveDue, occKey);
  pending.submittedAt = isOccurrencePastDue(effectiveDue, now) ? now : new Date(`${occKey}T23:59:59+05:30`);
  pending.submissionRemarks = autoMissedRemarksForOccurrence(effectiveDue, now);
  await pending.save();
  return "missed";
}

async function resetTaskToAssigneePendingWork(
  task,
  { todayKey, dropPending = null, markPendingMissed = false } = {}
) {
  const today = todayKey || calendarDayKeyInTz(new Date());
  if (dropPending) {
    if (markPendingMissed) {
      await finalizePendingAsAutoMissed(dropPending, task);
    } else {
      await TaskApprovalRecord.deleteOne({ _id: dropPending._id });
    }
  }
  task.status = "pending";
  task.approvalStatus = "none";
  task.submissionRemarks = "";
  if (task.taskType === "daily") {
    task.dueDate = occurrenceDueOnDay(task.dueDate, today);
  }
  await task.save();
}

/** Reset phantom/stale approval state — never auto-mark a real submission as missed. */
export async function repairAssigneeInboxApprovalState(assigneeId) {
  const candidates = await Task.find({
    deletedAt: null,
    assignees: assigneeId,
    $or: [
      { status: "awaiting_approval", approvalStatus: "pending" },
      { approvalStatus: "pending", status: { $nin: ["awaiting_approval", "completed", "cancelled"] } },
    ],
  });
  if (!candidates.length) return { repaired: 0 };

  const todayKey = calendarDayKeyInTz(new Date());
  let repaired = 0;

  for (const task of candidates) {
    if (task.approvalStatus === "pending" && !["awaiting_approval", "completed", "cancelled"].includes(task.status)) {
      task.approvalStatus = "none";
      task.submissionRemarks = "";
      await task.save();
      await TaskApprovalRecord.deleteMany({ taskId: task._id, status: "pending", kind: "completion" });
      repaired += 1;
      continue;
    }

    if (task.status !== "awaiting_approval" || task.approvalStatus !== "pending") continue;

    const pending = await TaskApprovalRecord.findOne({
      taskId: task._id,
      status: "pending",
      kind: "completion",
    }).sort({ submittedAt: -1 });

    if (!pending) {
      await resetTaskToAssigneePendingWork(task, { todayKey });
      repaired += 1;
    }
  }

  return { repaired };
}

/** For Approval inbox: repair phantom/stale rows and return only valid submissions. */
export async function repairAndFilterApprovalInboxTasks(taskDocs) {
  if (!taskDocs.length) return [];
  return filterAndEnrichApprovalInboxTasks(taskDocs);
}

/** For Approval inbox: display occurrence from pending record (read-only, no DB writes). */
export async function enrichApprovalInboxTasks(tasks) {
  if (!tasks.length) return [];

  const ids = tasks.map((t) => t._id);
  const pendingRows = await TaskApprovalRecord.find({
    taskId: { $in: ids },
    status: "pending",
  })
    .sort({ submittedAt: -1 })
    .lean();

  const pendingByTask = new Map();
  for (const r of pendingRows) {
    const tid = String(r.taskId);
    if (!pendingByTask.has(tid)) pendingByTask.set(tid, r);
  }

  return tasks.map((t) => {
    const doc = t.toObject ? t.toObject() : { ...t };
    const pending = pendingByTask.get(String(t._id));
    const effectiveDue = effectivePendingOccurrenceDue(pending, doc);
    if (effectiveDue) {
      doc.pendingOccurrenceDueDate = effectiveDue;
      if (doc.taskType === "daily") doc.dueDate = effectiveDue;
    }
    return doc;
  });
}

/** Tasks in scope that have a live submission waiting for review. */
export async function approvalInboxTaskMatchClause({ userId, role, centerId, isCeoRole }) {
  const visibilityTaskFilter = { deletedAt: null, status: { $nin: ["cancelled"] } };
  if (!isCeoRole && centerId) visibilityTaskFilter.centerId = centerId;
  const visibility = await approvalVisibilityClause({ userId, role, centerId, isCeoRole });
  if (visibility) Object.assign(visibilityTaskFilter, visibility);

  const visibleTaskIds = await Task.distinct("_id", visibilityTaskFilter);
  const pendingTaskIds =
    visibleTaskIds.length > 0
      ? await TaskApprovalRecord.distinct("taskId", {
          status: "pending",
          kind: { $in: ["completion", "not_done"] },
          taskId: { $in: visibleTaskIds },
        })
      : [];

  const or = [
    { status: "awaiting_approval", approvalStatus: "pending" },
    { "notDoneApproval.status": "pending" },
  ];
  if (pendingTaskIds.length) or.push({ _id: { $in: pendingTaskIds } });
  return { $or: or };
}

/** Align task.status with pending approval records so For Approval matches history. */
export async function repairApprovalInboxPendingTaskState({ userId, role, centerId, isCeoRole }) {
  const visibilityTaskFilter = { deletedAt: null, status: { $nin: ["cancelled"] } };
  if (!isCeoRole && centerId) visibilityTaskFilter.centerId = centerId;
  const visibility = await approvalVisibilityClause({ userId, role, centerId, isCeoRole });
  if (visibility) Object.assign(visibilityTaskFilter, visibility);

  const visibleTaskIds = await Task.distinct("_id", visibilityTaskFilter);
  if (!visibleTaskIds.length) return { repaired: 0 };

  const pendingTaskIds = await TaskApprovalRecord.distinct("taskId", {
    status: "pending",
    kind: "completion",
    taskId: { $in: visibleTaskIds },
  });
  if (!pendingTaskIds.length) return { repaired: 0 };

  let repaired = 0;
  const tasks = await Task.find({ _id: { $in: pendingTaskIds } });
  for (const task of tasks) {
    if (task.status === "awaiting_approval" && task.approvalStatus === "pending") continue;
    task.status = "awaiting_approval";
    task.approvalStatus = "pending";
    task.requiresApproval = true;
    await task.save();
    repaired += 1;
  }
  return { repaired };
}

function enrichApprovalInboxRow(base, pending, { todayKey }) {
  const effectiveDue = effectivePendingOccurrenceDue(pending, base);
  const occKey = calendarDayKeyInTz(effectiveDue);
  if (base.taskType === "daily" && occKey > todayKey) return null;
  return {
    ...base,
    pendingRecordId: String(pending._id),
    inboxRowKey: `${String(base._id)}-${occKey}`,
    pendingOccurrenceDueDate: effectiveDue,
    dueDate: effectiveDue,
    submissionRemarks: pending.submissionRemarks,
    pendingSubmittedAt: pending.submittedAt,
    submissionSource: pending.submissionSource || "assignee",
    status: "awaiting_approval",
    approvalStatus: "pending",
  };
}

/** Read-only For Approval list: one row per pending occurrence (incl. restored history rows). */
export async function filterAndEnrichApprovalInboxTasks(taskDocs) {
  if (!taskDocs.length) return [];

  const todayKey = calendarDayKeyInTz(new Date());
  const taskIds = taskDocs.map((t) => t._id || t.id);
  const pendingRows = await TaskApprovalRecord.find({
    taskId: { $in: taskIds },
    status: "pending",
    kind: { $in: ["completion", "not_done"] },
  })
    .sort({ occurrenceDueDate: 1, submittedAt: -1 })
    .lean();

  const pendingByTask = new Map();
  for (const r of pendingRows) {
    const tid = String(r.taskId);
    if (!pendingByTask.has(tid)) pendingByTask.set(tid, []);
    pendingByTask.get(tid).push(r);
  }

  const kept = [];
  for (const raw of taskDocs) {
    const base = raw.toObject ? raw.toObject() : { ...raw };
    const tid = String(base._id);

    if (base.notDoneApproval?.status === "pending") {
      base.submissionRemarks = base.notDoneApproval?.remarks || "";
      base.pendingOccurrenceDueDate = base.notDoneApproval?.dueDate || base.dueDate;
      base.inboxRowKey = `${tid}-notdone`;
      kept.push(base);
      continue;
    }

    const records = (pendingByTask.get(tid) || []).filter((r) => r.kind === "completion");
    if (records.length) {
      for (const pending of records) {
        const row = enrichApprovalInboxRow(base, pending, { todayKey });
        if (row) kept.push(row);
      }
      continue;
    }

    if (base.status === "awaiting_approval" && base.approvalStatus === "pending") {
      base.inboxRowKey = tid;
      kept.push(base);
    }
  }

  return kept;
}

export async function resolveOccurrenceDueForApproval(task) {
  const pending = await TaskApprovalRecord.findOne({
    taskId: task._id,
    status: "pending",
    kind: "completion",
  })
    .sort({ submittedAt: -1 })
    .lean();
  return effectivePendingOccurrenceDue(pending, task) || task.dueDate;
}

/** Fix occurrence due when stored date is after submit (weekly/fortnightly/etc. rolled forward). */
export function correctOccurrenceDatesInHistory(records) {
  return records.map((r) => {
    if (r.kind === "not_done" && r.status === "missed") return r;
    if (!r.submittedAt || !r.occurrenceDueDate) return r;
    const subKey = calendarDayKeyInTz(r.submittedAt);
    const dueKey = calendarDayKeyInTz(r.occurrenceDueDate);
    if (!subKey || !dueKey) return r;

    if (r.taskType === "daily" && dueKey !== subKey) {
      return { ...r, occurrenceDueDate: occurrenceDueOnDay(r.occurrenceDueDate, subKey) };
    }
    if (dueKey <= subKey) return r;

    const corrected = resolveOccurrenceDueForSubmitTime(
      { taskType: r.taskType, dueDate: r.occurrenceDueDate, recurrence: {} },
      r.submittedAt,
      r.occurrenceDueDate
    );
    if (!corrected || calendarDayKeyInTz(corrected) === dueKey) return r;
    return { ...r, occurrenceDueDate: corrected };
  });
}

/** @deprecated Use correctOccurrenceDatesInHistory */
export function correctMisdatedPendingOccurrence(records) {
  return correctOccurrenceDatesInHistory(records);
}

/** Assigner unapproves: flip the latest approved row back to pending (no duplicate row). */
export async function reopenApprovalForAssigner({ task, assigneeId, remarks, occurrenceDueDate }) {
  const assignedBy = taskAssignerIdFromDoc(task);
  if (!assignedBy || !assigneeId) return null;

  const query = {
    taskId: task._id,
    assigneeId,
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
      assigneeId,
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
    existing.submissionRemarks = text;
    existing.submissionSource = "assigner_reopen";
    await existing.save();
    await TaskApprovalRecord.deleteMany({
      taskId: task._id,
      assigneeId,
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
    submissionSource: "assigner_reopen",
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

export async function recordTaskSubmission({ task, assigneeId, remarks, kind = "completion", source = "assignee" }) {
  const assignedBy = taskAssignerIdFromDoc(task);
  if (!assignedBy || !assigneeId) return null;
  const submittedAt = new Date();
  let occurrenceDue = task.dueDate;
  if (kind === "completion" && isRecurring(task.taskType)) {
    if (task.taskType === "daily") {
      const todayKey = calendarDayKeyInTz(submittedAt);
      if (calendarDayKeyInTz(occurrenceDue) !== todayKey) {
        occurrenceDue = occurrenceDueOnDay(occurrenceDue, todayKey);
      }
    } else {
      occurrenceDue = resolveOccurrenceDueForSubmitTime(task, submittedAt, task.dueDate);
    }
  }
  const { start, end } = dueDateDayBounds(occurrenceDue);
  await TaskApprovalRecord.deleteMany({
    taskId: task._id,
    assigneeId,
    status: "pending",
    kind: "completion",
    occurrenceDueDate: { $gte: start, $lt: end },
  });
  return TaskApprovalRecord.create({
    taskId: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    centerId: task.centerId || null,
    assignedBy,
    assigneeId,
    occurrenceDueDate: occurrenceDue,
    submittedAt,
    submissionRemarks: String(remarks || "").trim(),
    kind,
    status: "pending",
    submissionSource: source,
  });
}

export async function finalizeApprovalRecord({ task, occurrenceDueDate, approverId, status, extra = {}, assigneeId = null }) {
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

  const scopedAssignee =
    assigneeId ||
    extra.assigneeId ||
    null;

  async function findPendingForDue(targetDue) {
    const { start, end } = dueDateDayBounds(targetDue);
    const base = {
      taskId: task._id,
      status: "pending",
      occurrenceDueDate: { $gte: start, $lt: end },
    };
    if (scopedAssignee) base.assigneeId = scopedAssignee;
    let pending = await TaskApprovalRecord.findOne(base).sort({ submittedAt: -1 });
    if (pending) return pending;

    if (isRecurring(task.taskType)) {
      const fallback = {
        taskId: task._id,
        status: "pending",
        kind: { $in: ["completion", "not_done"] },
      };
      if (scopedAssignee) fallback.assigneeId = scopedAssignee;
      return await TaskApprovalRecord.findOne(fallback).sort({ submittedAt: -1 });
    }
    return null;
  }

  const pending = await findPendingForDue(due);
  if (!pending) {
    if (extra.allowCreateWithoutPending) {
      const createAssignee =
        scopedAssignee ||
        (Array.isArray(task.assignees) && task.assignees.length === 1 ? task.assignees[0] : null);
      if (!createAssignee) return null;
      return TaskApprovalRecord.create({
        taskId: task._id,
        taskTitle: task.title,
        taskType: task.taskType,
        centerId: task.centerId || null,
        assignedBy: taskAssignerIdFromDoc(task),
        assigneeId: createAssignee,
        occurrenceDueDate: due,
        submittedAt: extra.submittedAt || task.updatedAt || new Date(),
        submissionRemarks: extra.submissionRemarks ?? task.submissionRemarks ?? "",
        kind: extra.kind || "completion",
        status,
        approvedAt: update.approvedAt || null,
        approvedBy: update.approvedBy || null,
        rejectedAt: update.rejectedAt || null,
        rejectedBy: update.rejectedBy || null,
        rejectionRemarks: extra.rejectionRemarks || "",
        rejectionMode: extra.rejectionMode || "",
        submissionSource: extra.submissionSource || "assignee",
      });
    }
    return null;
  }

  const setFields = { ...update };
  const subKey = calendarDayKeyInTz(pending.submittedAt);
  const occKey = calendarDayKeyInTz(pending.occurrenceDueDate);
  if (subKey && occKey && occKey > subKey && isRecurring(task.taskType)) {
    setFields.occurrenceDueDate = resolveOccurrenceDueForSubmitTime(
      task,
      pending.submittedAt,
      pending.occurrenceDueDate
    );
  } else if (task.taskType === "daily" && subKey && occKey && occKey !== subKey) {
    setFields.occurrenceDueDate = occurrenceDueOnDay(pending.occurrenceDueDate, subKey);
  }
  if (extra.submissionRemarks !== undefined) {
    setFields.submissionRemarks = extra.submissionRemarks;
  }

  return TaskApprovalRecord.findOneAndUpdate({ _id: pending._id }, { $set: setFields }, { new: true });
}

export async function recordNotDoneSubmission({ task, assigneeId, remarks, occurrenceDueDate }) {
  const assignedBy = taskAssignerIdFromDoc(task);
  if (!assignedBy || !assigneeId) return null;
  const submittedAt = new Date();
  let due = occurrenceDueDate || task.dueDate;
  if (isRecurring(task.taskType)) {
    due = resolveOccurrenceDueForSubmitTime(task, submittedAt, due);
  }
  return TaskApprovalRecord.create({
    taskId: task._id,
    taskTitle: task.title,
    taskType: task.taskType,
    centerId: task.centerId || null,
    assignedBy,
    assigneeId,
    occurrenceDueDate: due,
    submittedAt,
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

/** For Approval + performance: only tasks you assigned. */
export async function approvalVisibilityClause({ userId, role, centerId, isCeoRole }) {
  if (isCeoRole || role === "ceo") return null;
  return assignerScopeClause(userId);
}

/**
 * Everyone this user has ever assigned a task to (active + deleted tasks, plus approval history).
 */
export async function listMyAssignees({ userId, centerId, isCeoRole, role }) {
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

  const visibility = (await approvalVisibilityClause({ userId, role, centerId, isCeoRole })) || assignerScopeClause(userId);
  const taskFilter = { ...visibility };
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
export async function buildAssigneeHistoryQuery({ userId, assigneeId, centerId, isCeoRole, role, from, to }) {
  // Always key performance rows by person. Do not require them to still be on task.assignees
  // (multi-assignee split / rehome can move people off the original document).
  let q = { assigneeId };

  if (!isCeoRole) {
    const visibility =
      (await approvalVisibilityClause({ userId, role, centerId, isCeoRole })) || assignerScopeClause(userId);
    // All tasks this viewer assigned (not only ones where assignee is still listed).
    const scopedTaskFilter = { deletedAt: null, ...visibility };
    if (centerId) scopedTaskFilter.centerId = centerId;
    const taskIds = await Task.distinct("_id", scopedTaskFilter);

    // Also include live tasks currently assigned to this person in our scope.
    const assigneeTaskFilter = {
      deletedAt: null,
      assignees: assigneeId,
      ...visibility,
    };
    if (centerId) assigneeTaskFilter.centerId = centerId;
    const assigneeTaskIds = await Task.distinct("_id", assigneeTaskFilter);

    const allTaskIds = [...new Set([...taskIds, ...assigneeTaskIds].map(String))];
    q = {
      assigneeId,
      $or: [{ assignedBy: userId }, { taskId: { $in: allTaskIds } }],
    };
  }
  if (from || to) {
    q.occurrenceDueDate = {};
    if (from) {
      const key = calendarDayKeyInTz(new Date(String(from)));
      q.occurrenceDueDate.$gte = new Date(`${key}T00:00:00+05:30`);
    }
    if (to) {
      const key = calendarDayKeyInTz(new Date(String(to)));
      const end = new Date(`${key}T00:00:00+05:30`);
      end.setDate(end.getDate() + 1);
      q.occurrenceDueDate.$lt = end;
    }
  }
  return q;
}

function occurrenceDayKey(d) {
  if (!d) return "";
  return calendarDayKeyInTz(d);
}

function assigneeKey(r) {
  return String(r?.assigneeId?._id || r?.assigneeId || "");
}

function occurrenceRecordKey(r) {
  return `${String(r.taskId || "")}-${assigneeKey(r)}-${occurrenceDayKey(r.occurrenceDueDate)}`;
}

function approvalRecordPriority(r) {
  if (r.status === "pending") return 4;
  if (r.status === "approved" || r.status === "not_done_acknowledged") return 3;
  if (r.status === "rejected") return 2;
  if (r.status === "missed") return 1;
  return 0;
}

/** Prefer assignee not-done / approval rows over auto-missed for the same task + assignee + day. */
function pickPreferredApprovalRecord(prev, r) {
  const pp = approvalRecordPriority(prev);
  const rp = approvalRecordPriority(r);
  if (rp !== pp) return rp > pp ? r : prev;
  if (prev.kind === "not_done" && r.status === "missed") return prev;
  if (r.kind === "not_done" && prev.status === "missed") return r;
  if (prev.live && !r.live) return r;
  if (!prev.live && r.live) return prev;
  return new Date(r.submittedAt) > new Date(prev.submittedAt) ? r : prev;
}

/** One row per task + assignee + occurrence; pending wins over approved when assigner reopened. */
export function dedupeApprovalRecords(records) {
  const byKey = new Map();
  for (const r of records) {
    const key = occurrenceRecordKey(r);
    const prev = byKey.get(key);
    byKey.set(key, prev ? pickPreferredApprovalRecord(prev, r) : r);
  }
  return [...byKey.values()].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/** Keep one pending row per task + assignee + occurrence day (drops true duplicates only). */
export function pruneDuplicatePendingPerTask(records) {
  const latestPendingByKey = new Map();
  for (const r of records) {
    if (r.status !== "pending") continue;
    const key = occurrenceRecordKey(r);
    const prev = latestPendingByKey.get(key);
    if (!prev || new Date(r.submittedAt).getTime() > new Date(prev.submittedAt).getTime()) {
      latestPendingByKey.set(key, r);
    }
  }
  if (!latestPendingByKey.size) return records;
  return records.filter((r) => {
    if (r.status !== "pending") return true;
    const key = occurrenceRecordKey(r);
    const latest = latestPendingByKey.get(key);
    return latest && String(r._id) === String(latest._id);
  });
}

/**
 * After send-back, hide the latest approved row for a task when a newer pending exists
 * (fixes legacy duplicate rows: approved 5/6 + waiting 6/6 for the same reopen).
 */
export function collapseReopenedDuplicates(records) {
  const byTaskAssignee = new Map();
  for (const r of records) {
    const tid = String(r.taskId || "");
    if (!tid) continue;
    const key = `${tid}-${assigneeKey(r)}`;
    if (!byTaskAssignee.has(key)) byTaskAssignee.set(key, []);
    byTaskAssignee.get(key).push(r);
  }

  const kept = [];
  for (const rows of byTaskAssignee.values()) {
    const pending = rows
      .filter((r) => r.status === "pending")
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    if (!pending.length) {
      kept.push(...rows);
      continue;
    }
    const latestPending = pending[0];
    const pendingDay = occurrenceDayKey(latestPending.occurrenceDueDate);
    const latestPendingAt = new Date(latestPending.submittedAt).getTime();
    const approvedSameDay = rows
      .filter(
        (r) =>
          (r.status === "approved" || r.status === "not_done_acknowledged") &&
          occurrenceDayKey(r.occurrenceDueDate) === pendingDay
      )
      .sort(
        (a, b) =>
          new Date(b.approvedAt || b.submittedAt).getTime() -
          new Date(a.approvedAt || a.submittedAt).getTime()
      );
    const supersededApprovedId =
      approvedSameDay[0] &&
      new Date(approvedSameDay[0].approvedAt || approvedSameDay[0].submittedAt).getTime() < latestPendingAt
        ? String(approvedSameDay[0]._id)
        : null;

    for (const r of rows) {
      if (supersededApprovedId && String(r._id) === supersededApprovedId) continue;
      kept.push(r);
    }
  }

  return kept.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

function nextCalendarDayKey(dayKey) {
  const anchor = new Date(`${dayKey}T12:00:00+05:30`);
  anchor.setDate(anchor.getDate() + 1);
  return calendarDayKeyInTz(anchor);
}

function isDailyOccurrenceScheduled(task, dayKey) {
  if (task.taskType !== "daily") return false;
  const weekOff = task.recurrence?.weekOff || "Sunday";
  const includeSunday = task.recurrence?.includeSunday === true;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "long",
  }).format(new Date(`${dayKey}T12:00:00+05:30`));
  if (!includeSunday && weekday === weekOff) return false;
  const forever = task.recurrence?.forever === true;
  const endDate = task.recurrence?.endDate ? new Date(task.recurrence.endDate) : null;
  if (!forever && endDate && new Date(`${dayKey}T12:00:00+05:30`) > endDate) return false;
  return true;
}

async function dailyTasksForAssigneeHistory({ assigneeId, userId, centerId, isCeoRole, role }) {
  const taskFilter = {
    deletedAt: null,
    taskType: "daily",
    assignees: assigneeId,
  };
  if (!isCeoRole) {
    const visibility =
      (await approvalVisibilityClause({ userId, role, centerId, isCeoRole })) || assignerScopeClause(userId);
    Object.assign(taskFilter, visibility);
    if (centerId) taskFilter.centerId = centerId;
  }
  // Solo-assignee tasks only — shared multi-assignee legacy tasks inflate everyone else's history.
  return Task.find(taskFilter)
    .select("_id title taskType createdAt recurrence dueDate assignees")
    .lean()
    .then((tasks) => tasks.filter((t) => (t.assignees || []).length <= 1));
}

/** Fill gaps so every scheduled daily occurrence since assignment appears in history. */
export async function fillMissingDailyOccurrenceHistory({
  assigneeId,
  records,
  userId,
  centerId,
  isCeoRole,
  role,
  from,
  to,
}) {
  const tasks = await dailyTasksForAssigneeHistory({ assigneeId, userId, centerId, isCeoRole, role });
  if (!tasks.length) return sortRecordsByOccurrence(records);

  const todayKey = calendarDayKeyInTz(new Date());
  const fromKey = from ? calendarDayKeyInTz(new Date(String(from))) : null;
  const toKey = to ? calendarDayKeyInTz(new Date(String(to))) : todayKey;
  const rangeEndKey = toKey < todayKey ? toKey : todayKey;

  const recordKeys = new Set(records.map((r) => occurrenceRecordKey({ ...r, assigneeId })));
  const pendingKeys = new Set(
    records
      .filter((r) => r.status === "pending")
      .map((r) => occurrenceRecordKey({ ...r, assigneeId }))
  );

  const synth = [];
  for (const task of tasks) {
    const createdKey = calendarDayKeyInTz(task.createdAt);
    let dayKey = createdKey;
    while (dayKey <= rangeEndKey && !isDailyOccurrenceScheduled(task, dayKey)) {
      dayKey = nextCalendarDayKey(dayKey);
    }

    while (dayKey <= rangeEndKey) {
      if (fromKey && dayKey < fromKey) {
        dayKey = nextCalendarDayKey(dayKey);
        continue;
      }
      if (!isDailyOccurrenceScheduled(task, dayKey)) {
        dayKey = nextCalendarDayKey(dayKey);
        continue;
      }

      const recKey = occurrenceRecordKey({
        taskId: task._id,
        assigneeId,
        occurrenceDueDate: occurrenceDueOnDay(task.dueDate, dayKey),
      });
      const dueDt = occurrenceDueOnDay(task.dueDate, dayKey);
      if (!recordKeys.has(recKey) && !pendingKeys.has(recKey) && dayKey < todayKey) {
        synth.push({
          _id: `gap-${task._id}-${assigneeId}-${dayKey}`,
          taskId: task._id,
          assigneeId,
          taskTitle: task.title,
          taskType: task.taskType,
          occurrenceDueDate: dueDt,
          submittedAt: dueDt,
          submissionRemarks: GAP_MISSED_REMARKS,
          kind: "not_done",
          status: "missed",
        });
        recordKeys.add(recKey);
      }
      dayKey = nextCalendarDayKey(dayKey);
    }
  }

  return sortRecordsByOccurrence([...records, ...synth]);
}

/** Fix DB rows: missed on today (day not ended), wrong occurrence day, or assignee remarks on auto-missed. */
export async function repairMisdatedMissedRecords({ assigneeId }) {
  const tasks = await Task.find({ deletedAt: null, assignees: assigneeId, taskType: "daily" })
    .select("_id title taskType dueDate")
    .lean();
  if (!tasks.length) return { fixed: 0, removed: 0 };
  const taskById = new Map(tasks.map((t) => [String(t._id), t]));
  const missed = await TaskApprovalRecord.find({
    taskId: { $in: tasks.map((t) => t._id) },
    assigneeId,
    status: "missed",
  });
  let fixed = 0;
  let removed = 0;

  for (const rec of missed) {
    const task = taskById.get(String(rec.taskId));
    if (!task) continue;
    const effectiveDue = effectivePendingOccurrenceDue(rec, task);
    const occKey = calendarDayKeyInTz(effectiveDue || rec.occurrenceDueDate);
    const displayKey = calendarDayKeyInTz(rec.occurrenceDueDate);

    if (!occKey || !isOccurrencePastDue(rec.occurrenceDueDate, new Date())) {
      await TaskApprovalRecord.deleteOne({ _id: rec._id });
      removed += 1;
      continue;
    }

    const { start, end } = dueDateDayBounds(effectiveDue || rec.occurrenceDueDate);
    const approved = await TaskApprovalRecord.findOne({
      taskId: rec.taskId,
      assigneeId,
      status: { $in: ["approved", "not_done_acknowledged"] },
      occurrenceDueDate: { $gte: start, $lt: end },
      _id: { $ne: rec._id },
    }).lean();
    if (approved) {
      await TaskApprovalRecord.deleteOne({ _id: rec._id });
      removed += 1;
      continue;
    }

    let changed = false;
    if (displayKey !== occKey) {
      rec.occurrenceDueDate = occurrenceDueOnDay(effectiveDue || rec.occurrenceDueDate, occKey);
      rec.submittedAt = isOccurrencePastDue(rec.occurrenceDueDate, new Date())
        ? new Date()
        : new Date(`${occKey}T23:59:59+05:30`);
      changed = true;
    }
    if (!isAutoMissedRemarks(rec.submissionRemarks)) {
      if (rec.kind === "not_done" && rec.submissionRemarks?.trim()) {
        // Assignee marked not done — keep their remarks.
      } else {
        rec.submissionRemarks = AUTO_MISSED_REMARKS;
        changed = true;
      }
    }
    if (changed) {
      await rec.save();
      fixed += 1;
    }
  }

  return { fixed, removed };
}

function isInstantApproval(record) {
  const subTime = new Date(record.submittedAt || 0).getTime();
  const apprTime = new Date(record.approvedAt || record.submittedAt || 0).getTime();
  if (!subTime || !apprTime) return false;
  return Math.abs(subTime - apprTime) < 5000;
}

/** Approved row created without a real assignee submit (instant approve, no separate submit time). */
export function isPhantomApprovedRecord(record) {
  if (record.status !== "approved") return false;
  if (record.kind !== "completion") return false;
  if (record.submissionSource === "assigner_reopen") return false;
  return isInstantApproval(record);
}

/** Remove DB rows: approved without assignee submission (duplicate prior-day remarks). */
export async function repairPhantomApprovedRecords({ assigneeId }) {
  const tasks = await Task.find({ deletedAt: null, assignees: assigneeId, taskType: "daily" })
    .select("_id")
    .lean();
  if (!tasks.length) return { removed: 0 };

  const approved = await TaskApprovalRecord.find({
    taskId: { $in: tasks.map((t) => t._id) },
    assigneeId,
    status: { $in: ["approved", "not_done_acknowledged"] },
    kind: "completion",
  }).sort({ occurrenceDueDate: 1, submittedAt: 1 });

  const byTask = new Map();
  for (const rec of approved) {
    const tid = String(rec.taskId);
    if (!byTask.has(tid)) byTask.set(tid, []);
    byTask.get(tid).push(rec);
  }

  let removed = 0;
  for (const rows of byTask.values()) {
    for (const rec of rows) {
      if (!isPhantomApprovedRecord(rec)) continue;
      await TaskApprovalRecord.deleteOne({ _id: rec._id });
      removed += 1;
    }
  }

  return { removed };
}

/** Align occurrence due to submit time; drop instant-approve phantoms (all recurring types). */
export async function repairMisdatedApprovedRecords({ assigneeId }) {
  const tasks = await Task.find({
    deletedAt: null,
    assignees: assigneeId,
    taskType: { $in: ["daily", "weekly", "fortnightly", "monthly", "quarterly", "yearly"] },
  })
    .select("_id taskType dueDate recurrence")
    .lean();
  if (!tasks.length) return { fixed: 0, removed: 0 };
  const taskById = new Map(tasks.map((t) => [String(t._id), t]));

  const records = await TaskApprovalRecord.find({
    taskId: { $in: tasks.map((t) => t._id) },
    assigneeId,
    status: { $in: ["approved", "rejected", "pending", "not_done_acknowledged"] },
    kind: { $in: ["completion", "not_done"] },
    submittedAt: { $exists: true },
  });

  let fixed = 0;
  let removed = 0;
  for (const rec of records) {
    if (rec.status === "approved" && isPhantomApprovedRecord(rec)) {
      await TaskApprovalRecord.deleteOne({ _id: rec._id });
      removed += 1;
      continue;
    }
    const task = taskById.get(String(rec.taskId));
    if (!task || !rec.occurrenceDueDate) continue;

    const subKey = calendarDayKeyInTz(rec.submittedAt);
    const occKey = calendarDayKeyInTz(rec.occurrenceDueDate);
    if (!subKey || !occKey) continue;

    let corrected = null;
    if (task.taskType === "daily" && occKey !== subKey) {
      corrected = occurrenceDueOnDay(rec.occurrenceDueDate, subKey);
    } else if (occKey > subKey) {
      corrected = resolveOccurrenceDueForSubmitTime(task, rec.submittedAt, rec.occurrenceDueDate);
    }

    if (corrected && calendarDayKeyInTz(corrected) !== occKey) {
      rec.occurrenceDueDate = corrected;
      await rec.save();
      fixed += 1;
    }
  }
  return { fixed, removed };
}

/** Remove auto-missed rows that overwrite assignee not-done for the same day. */
export async function repairNotDoneMissedConflicts({ assigneeId }) {
  const tasks = await Task.find({ deletedAt: null, assignees: assigneeId }).select("_id").lean();
  if (!tasks.length) return { removed: 0 };

  const notDoneRows = await TaskApprovalRecord.find({
    taskId: { $in: tasks.map((t) => t._id) },
    assigneeId,
    kind: "not_done",
    status: { $in: ["pending", "not_done_acknowledged"] },
  }).lean();

  let removed = 0;
  for (const nd of notDoneRows) {
    const { start, end } = dueDateDayBounds(nd.occurrenceDueDate);
    const result = await TaskApprovalRecord.deleteMany({
      taskId: nd.taskId,
      assigneeId,
      status: "missed",
      occurrenceDueDate: { $gte: start, $lt: end },
    });
    removed += result.deletedCount || 0;
  }
  return { removed };
}

/** Run all history repairs for one assignee (org-wide on refresh). */
export async function repairAssigneeHistoryRecords({ assigneeId }) {
  // First restore / split shared multi-assignee damage so inbox + performance exist per person.
  const shared = await repairSharedMultiAssigneeForAssignee(assigneeId);
  const restoredSubmissions = await repairWronglyAutoMissedSubmissions({ assigneeId });
  const misdatedApproved = await repairMisdatedApprovedRecords({ assigneeId });
  const phantoms = await repairPhantomApprovedRecords({ assigneeId });
  const missed = await repairMisdatedMissedRecords({ assigneeId });
  const notDoneConflicts = await repairNotDoneMissedConflicts({ assigneeId });
  return {
    shared,
    misdatedApproved,
    phantoms,
    missed,
    notDoneConflicts,
    restoredSubmissions,
  };
}

/** Drop phantom approved rows from API responses. */
export function sanitizeHistoryApprovedDisplay(records) {
  const byTask = new Map();
  for (const r of records) {
    const tid = String(r.taskId || "");
    if (!tid) continue;
    if (!byTask.has(tid)) byTask.set(tid, []);
    byTask.get(tid).push(r);
  }

  const dropIds = new Set();
  for (const rows of byTask.values()) {
    for (const r of rows) {
      if (isPhantomApprovedRecord(r)) dropIds.add(String(r._id));
    }
  }

  return dropIds.size ? records.filter((r) => !dropIds.has(String(r._id))) : records;
}

/** Hide premature auto-missed rows (before due date-time) and normalize remarks in API responses. */
export function sanitizeHistoryMissedDisplay(records, now = new Date()) {
  return records
    .map((r) => {
      if (r.status !== "missed") return r;
      if (!isOccurrencePastDue(r.occurrenceDueDate, now)) return null;
      if (r.kind === "not_done" && r.submissionRemarks?.trim() && !isAutoMissedRemarks(r.submissionRemarks)) {
        return r;
      }
      if (!isAutoMissedRemarks(r.submissionRemarks)) {
        return { ...r, submissionRemarks: autoMissedRemarksForOccurrence(r.occurrenceDueDate, now) };
      }
      return r;
    })
    .filter(Boolean);
}

export function sortRecordsByOccurrence(records) {
  return [...records].sort((a, b) => {
    const occ = new Date(b.occurrenceDueDate).getTime() - new Date(a.occurrenceDueDate).getTime();
    if (occ !== 0) return occ;
    return String(a.taskTitle || "").localeCompare(String(b.taskTitle || ""));
  });
}

/** Tasks currently waiting in For Approval (includes rows without a history record yet). */
export async function fetchLivePendingApprovals({ userId, assigneeId, centerId, isCeoRole, role, from, to }) {
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
    const visibility =
      (await approvalVisibilityClause({ userId, role, centerId, isCeoRole })) || assignerScopeClause(userId);
    taskFilter.$and.push(visibility);
    if (centerId) taskFilter.centerId = centerId;
  }

  const tasks = await Task.find(taskFilter)
    .select("_id title taskType dueDate submissionRemarks updatedAt notDoneApproval assignees")
    .lean();

  const taskIds = tasks.map((t) => t._id);
  const storedPendingRows =
    taskIds.length > 0
      ? await TaskApprovalRecord.find({
          taskId: { $in: taskIds },
          assigneeId,
          status: "pending",
          kind: { $in: ["completion", "not_done"] },
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
    const storedPending = pendingByTask.get(String(t._id));
    // Task-level awaiting_approval on a shared multi-assignee task often belongs to someone else.
    // Only surface live rows when THIS assignee has a pending history record (or solo-assignee not-done).
    const soloAssignee = (t.assignees || []).length <= 1;
    const isNotDone = t.notDoneApproval?.status === "pending" && soloAssignee;
    if (!isNotDone && !storedPending) continue;

    const isNotDoneRow = isNotDone || storedPending?.kind === "not_done";
    let submittedAt = isNotDone ? t.notDoneApproval?.submittedAt || t.updatedAt : t.updatedAt;
    let occurrenceDueDate = isNotDone ? t.notDoneApproval?.dueDate || t.dueDate : t.dueDate;
    let remarks = isNotDone ? t.notDoneApproval?.remarks : t.submissionRemarks;
    if (storedPending) {
      submittedAt = storedPending.submittedAt;
      occurrenceDueDate = storedPending.occurrenceDueDate;
      remarks = storedPending.submissionRemarks;
    }

    if (from || to) {
      const occKey = occurrenceDayKey(occurrenceDueDate);
      if (from) {
        const fromKey = calendarDayKeyInTz(new Date(String(from)));
        if (occKey < fromKey) continue;
      }
      if (to) {
        const toKey = calendarDayKeyInTz(new Date(String(to)));
        if (occKey > toKey) continue;
      }
    }

    rows.push({
      _id: `live-${t._id}-${assigneeId}-${occurrenceDayKey(occurrenceDueDate)}`,
      taskId: t._id,
      assigneeId,
      taskTitle: t.title,
      taskType: t.taskType,
      occurrenceDueDate,
      submittedAt,
      submissionRemarks: String(remarks || "").trim(),
      status: "pending",
      kind: isNotDoneRow ? "not_done" : "completion",
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
  const covered = new Set(records.map((r) => occurrenceRecordKey(r)));
  const extra = livePending.filter((p) => !covered.has(occurrenceRecordKey(p)));
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
        assigneeId: e.actorId || (task.assignees?.length === 1 ? task.assignees[0] : null),
        occurrenceDueDate: task.dueDate,
        remarks: task.submissionRemarks || "",
      });
      continue;
    }

    if (e.eventType !== "approved" && e.eventType !== "rejected") continue;

    const pending = pendingSubmit.get(tid);
    const assigneeId = pending?.assigneeId || (task.assignees?.length === 1 ? task.assignees[0] : null);
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
