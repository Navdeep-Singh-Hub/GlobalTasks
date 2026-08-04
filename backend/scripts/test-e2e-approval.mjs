/**
 * End-to-end integration test against live Mongo (isolated smoke users).
 * Run: node scripts/test-e2e-approval.mjs
 * Creates temp users/tasks, exercises submit/approve/not-done/claim, then cleans up.
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/User.js";
import { Center } from "../src/models/Center.js";
import { Task } from "../src/models/Task.js";
import { TaskApprovalRecord } from "../src/models/TaskApprovalRecord.js";
import { TaskEvent } from "../src/models/TaskEvent.js";
import {
  claimSharedTaskForAssignee,
  recordTaskSubmission,
  recordNotDoneSubmission,
  finalizeApprovalRecord,
  dedupeApprovalRecords,
  resolvePersonalWorkTaskView,
  filterAssigneePersonalOpenTasks,
  finalizePendingAsAutoMissed,
  isWronglyAutoMissedSubmissionRemarks,
  repairMislabeledNotDoneFromCompletion,
} from "../src/services/taskApprovalHistory.js";

let passed = 0;
let failed = 0;
const tag = `e2e_smoke_${Date.now()}`;

function assert(cond, name, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function cleanup(ids) {
  const { userIds = [], taskIds = [], centerIds = [], emailTag = "" } = ids;
  if (taskIds.length) {
    await TaskApprovalRecord.deleteMany({ taskId: { $in: taskIds } });
    await TaskEvent.deleteMany({ taskId: { $in: taskIds } });
    await Task.deleteMany({ _id: { $in: taskIds } });
  }
  // also any tasks we may have cloned with same title prefix
  if (emailTag) {
    const extra = await Task.find({ title: new RegExp(`^\\[${emailTag}`) }).select("_id").lean();
    const extraIds = extra.map((t) => t._id);
    if (extraIds.length) {
      await TaskApprovalRecord.deleteMany({ taskId: { $in: extraIds } });
      await TaskEvent.deleteMany({ taskId: { $in: extraIds } });
      await Task.deleteMany({ _id: { $in: extraIds } });
    }
    await User.deleteMany({ email: new RegExp(`^${emailTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`) });
  }
  if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
  if (centerIds.length) await Center.deleteMany({ _id: { $in: centerIds } });
}

async function main() {
  console.log("\n=== E2E approval flows (temp isolated data) ===\n");
  await connectDatabase(process.env.MONGODB_URI);

  const passwordHash = await bcrypt.hash("e2e-test-only", 8);
  let center = await Center.findOne({ code: "E2E" });
  let createdCenter = false;
  if (!center) {
    center = await Center.create({ name: "E2E Smoke Center", code: "E2E" });
    createdCenter = true;
  }

  const [assigner, a1, a2] = await User.insertMany([
    {
      name: `${tag} Assigner`,
      email: `${tag}.assigner@example.test`,
      role: "centre_head",
      centerId: center._id,
      passwordHash,
      active: true,
      permissions: ["view_tasks", "assign_tasks", "approve_tasks"],
    },
    {
      name: `${tag} A1`,
      email: `${tag}.a1@example.test`,
      role: "executor",
      centerId: center._id,
      passwordHash,
      active: true,
      reportsTo: null,
    },
    {
      name: `${tag} A2`,
      email: `${tag}.a2@example.test`,
      role: "executor",
      centerId: center._id,
      passwordHash,
      active: true,
    },
  ]);
  a1.reportsTo = assigner._id;
  a2.reportsTo = assigner._id;
  await a1.save();
  await a2.save();

  const userIds = [assigner._id, a1._id, a2._id];
  const taskIds = [];
  const centerIds = createdCenter ? [center._id] : [];

  try {
    // --- 1. Fan-out create (simulate route) ---
    console.log("--- Fan-out multi-assign create ---");
    const due = new Date();
    due.setHours(23, 59, 0, 0);
    const sharedPayload = {
      title: `[${tag}] shared daily sheet`,
      taskType: "one_time",
      priority: "normal",
      status: "pending",
      dueDate: due,
      centerId: center._id,
      createdBy: assigner._id,
      assignedBy: assigner._id,
      requiresApproval: true,
      approvalStatus: "none",
    };
    // Legacy shared: one task many assignees
    const shared = await Task.create({
      ...sharedPayload,
      assignees: [a1._id, a2._id],
    });
    taskIds.push(shared._id);
    assert(shared.assignees.length === 2, "legacy shared task has 2 assignees");

    // Fan-out style (new create)
    const fan = await Task.insertMany([
      { ...sharedPayload, title: `[${tag}] fan a1`, assignees: [a1._id] },
      { ...sharedPayload, title: `[${tag}] fan a2`, assignees: [a2._id] },
    ]);
    taskIds.push(...fan.map((t) => t._id));
    assert(fan.every((t) => t.assignees.length === 1), "fan-out tasks are solo");

    // --- 2. claimShared on submit ---
    console.log("--- claimSharedTaskForAssignee ---");
    const claim = await claimSharedTaskForAssignee(shared, a1._id, { actorId: a1._id });
    assert(String(claim.workingTask.assignees[0]) === String(a1._id), "claimer owns working task");
    assert(claim.workingTask.assignees.length === 1, "working task solo after claim");
    assert(claim.clones.length === 1, "one clone for other assignee");
    taskIds.push(...claim.clones.map((c) => c._id));

    const clone = claim.clones[0];
    assert(String(clone.assignees[0]) === String(a2._id), "clone assigned to A2");
    assert(clone.status === "pending", "clone stays open for A2");
    // Claim mutates assignees in memory; route would save — do so for realism
    await claim.workingTask.save();

    // --- 3. A1 submits for approval; A2 clone remains open ---
    console.log("--- recordTaskSubmission ---");
    let working = claim.workingTask;
    working.submissionRemarks = "A1 finished OT supervision";
    working.status = "awaiting_approval";
    working.approvalStatus = "pending";
    await working.save();
    await recordTaskSubmission({
      task: working,
      assigneeId: a1._id,
      remarks: "A1 finished OT supervision",
      kind: "completion",
    });
    const pendA1 = await TaskApprovalRecord.findOne({
      taskId: working._id,
      assigneeId: a1._id,
      status: "pending",
      kind: "completion",
    });
    assert(Boolean(pendA1), "A1 has pending completion record");

    const cloneFresh = await Task.findById(clone._id);
    assert(cloneFresh.status === "pending" || cloneFresh.status === "open" || cloneFresh.approvalStatus !== "pending", "A2 clone not awaiting");

    // personal work views
    const viewA1 = await resolvePersonalWorkTaskView(working.toObject(), a1._id);
    assert(viewA1.personalWorkState === "submitted", "A1 personalWorkState submitted");
    const viewA2onClone = await resolvePersonalWorkTaskView(cloneFresh.toObject(), a2._id);
    assert(viewA2onClone.personalWorkState === "open", "A2 on clone personalWorkState open");

    // --- 4. Approve A1 ---
    console.log("--- finalizeApprovalRecord approve ---");
    const approved = await finalizeApprovalRecord({
      task: working,
      occurrenceDueDate: working.dueDate,
      approverId: assigner._id,
      status: "approved",
      assigneeId: a1._id,
    });
    assert(Boolean(approved) && approved.status === "approved", "A1 approved");

    // --- 5. A2 not-done on fan task ---
    console.log("--- not-done path ---");
    const notDoneTask = fan[1];
    await recordNotDoneSubmission({
      task: notDoneTask,
      assigneeId: a2._id,
      remarks: "No staff available today",
      occurrenceDueDate: notDoneTask.dueDate,
    });
    const nd = await TaskApprovalRecord.findOne({
      taskId: notDoneTask._id,
      assigneeId: a2._id,
      kind: "not_done",
    });
    assert(Boolean(nd), "not-done record created");
    assert(nd.kind === "not_done", "kind is not_done");

    // --- 6. Sticky notDone + completion pending → approve completes ---
    console.log("--- sticky notDone + completion ---");
    const sticky = await Task.create({
      ...sharedPayload,
      title: `[${tag}] sticky approve`,
      assignees: [a1._id],
      status: "awaiting_approval",
      approvalStatus: "pending",
      notDoneApproval: {
        status: "pending",
        remarks: "stale flag",
        dueDate: due,
        submittedAt: new Date(),
      },
      submissionRemarks: "Actually completed with remarks",
    });
    taskIds.push(sticky._id);
    await recordTaskSubmission({
      task: sticky,
      assigneeId: a1._id,
      remarks: "Actually completed with remarks",
      kind: "completion",
    });
    const hasCompletion = await TaskApprovalRecord.findOne({
      taskId: sticky._id,
      status: "pending",
      kind: "completion",
    });
    assert(Boolean(hasCompletion), "completion pending exists alongside sticky notDone");

    // Simulate approve route logic
    sticky.notDoneApproval = undefined;
    await sticky.save();
    const approvedSticky = await finalizeApprovalRecord({
      task: sticky,
      occurrenceDueDate: sticky.dueDate,
      approverId: assigner._id,
      status: "approved",
      assigneeId: a1._id,
    });
    assert(approvedSticky?.status === "approved" && approvedSticky?.kind === "completion", "approve prefers completion over sticky notDone");

    // --- 7. finalizePendingAsAutoMissed keeps completion kind ---
    console.log("--- auto-miss after submit ---");
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    yesterday.setHours(18, 0, 0, 0);
    const expireTask = await Task.create({
      ...sharedPayload,
      title: `[${tag}] expire submit`,
      assignees: [a1._id],
      dueDate: yesterday,
      status: "awaiting_approval",
      approvalStatus: "pending",
      submissionRemarks: "Deepa - supervision done late",
    });
    taskIds.push(expireTask._id);
    await recordTaskSubmission({
      task: expireTask,
      assigneeId: a1._id,
      remarks: "Deepa - supervision done late",
      kind: "completion",
    });
    // Force occurrence day to yesterday so finalize can mark missed
    const expPend = await TaskApprovalRecord.findOne({
      taskId: expireTask._id,
      status: "pending",
      kind: "completion",
    });
    expPend.occurrenceDueDate = yesterday;
    await expPend.save();
    const missedResult = await finalizePendingAsAutoMissed(expPend, expireTask, {
      now: new Date(),
    });
    assert(missedResult === "missed", `auto-miss marks missed (got ${missedResult})`);
    const missedRec = await TaskApprovalRecord.findById(expPend._id);
    assert(missedRec?.status === "missed", "record status is missed");
    assert(missedRec?.kind === "completion", "auto-miss keeps completion kind");
    assert(
      isWronglyAutoMissedSubmissionRemarks(missedRec.submissionRemarks) ||
        String(missedRec.submissionRemarks).includes("Original remarks"),
      "auto-miss remarks preserve original submit context"
    );

    // --- 8. dedupe: approved completion beats not_done_acknowledged ---
    console.log("--- dedupe priority ---");
    const day = due;
    const deduped = dedupeApprovalRecords([
      {
        _id: "x1",
        taskId: String(sticky._id),
        assigneeId: String(a1._id),
        occurrenceDueDate: day,
        submittedAt: new Date(),
        status: "not_done_acknowledged",
        kind: "not_done",
        submissionRemarks: "wrong",
      },
      {
        _id: "x2",
        taskId: String(sticky._id),
        assigneeId: String(a1._id),
        occurrenceDueDate: day,
        submittedAt: new Date(),
        status: "approved",
        kind: "completion",
        submissionRemarks: "ok",
      },
    ]);
    assert(deduped.length === 1 && deduped[0].status === "approved", "dedupe prefers approved completion");

    // --- 9. filterAssigneePersonalOpenTasks ---
    console.log("--- personal open filter ---");
    const multiAwait = await Task.create({
      ...sharedPayload,
      title: `[${tag}] multi await filter`,
      assignees: [a1._id, a2._id],
      status: "awaiting_approval",
      approvalStatus: "pending",
      submissionRemarks: "someone submitted",
    });
    taskIds.push(multiAwait._id);
    // no per-user pending for a2 → a2 should still see as open work candidate
    const openForA2 = await filterAssigneePersonalOpenTasks([multiAwait.toObject()], a2._id);
    assert(openForA2.length === 1, "A2 still sees multi awaiting without personal pending");
    // create pending for a2 → should drop from open
    await recordTaskSubmission({
      task: multiAwait,
      assigneeId: a2._id,
      remarks: "A2 also submitted",
      kind: "completion",
    });
    const openForA2b = await filterAssigneePersonalOpenTasks([multiAwait.toObject()], a2._id);
    assert(openForA2b.length === 0, "A2 open filter hides when they have pending submit");

    // --- 10. repairMislabeled (no-op without wrong events is fine) ---
    console.log("--- repairMislabeled ---");
    const repair = await repairMislabeledNotDoneFromCompletion({ assigneeId: a1._id });
    assert(typeof repair.fixed === "number", `repair ran (fixed=${repair.fixed})`);

    console.log("\n----------------------------------------");
    console.log(`Results: ${passed} passed, ${failed} failed`);
  } finally {
    await cleanup({ userIds, taskIds, centerIds, emailTag: tag });
    await mongoose.disconnect().catch(() => {});
  }

  if (failed > 0) process.exit(1);
  console.log("All E2E approval tests passed.\n");
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
