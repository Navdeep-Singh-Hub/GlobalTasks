/**
 * Offline unit tests for approval / performance history flows.
 * Run: node scripts/test-approval-flows.mjs
 */
import {
  dedupeApprovalRecords,
  isAutoMissedRemarks,
  isWronglyAutoMissedSubmissionRemarks,
  mergeAssigneeApprovalRows,
  collapseReopenedDuplicates,
  pruneDuplicatePendingPerTask,
  sanitizeHistoryMissedDisplay,
  reclassifyMislabeledNotDoneForDisplay,
  looksLikeExplicitNotDoneReason,
  GAP_MISSED_REMARKS,
  AUTO_MISSED_REMARKS,
} from "../src/services/taskApprovalHistory.js";

let passed = 0;
let failed = 0;

function assert(cond, name) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

function day(isoDate, hour = 12) {
  // IST midday for the given YYYY-MM-DD
  return new Date(`${isoDate}T${String(hour).padStart(2, "0")}:00:00+05:30`);
}

const taskA = "aaaaaaaaaaaaaaaaaaaaaaaa";
const taskB = "bbbbbbbbbbbbbbbbbbbbbbbb";
const user1 = "111111111111111111111111";
const user2 = "222222222222222222222222";

console.log("\n=== 1. Auto-missed remark classification ===");
assert(isAutoMissedRemarks(AUTO_MISSED_REMARKS), "AUTO_MISSED is auto");
assert(isAutoMissedRemarks(GAP_MISSED_REMARKS), "GAP_MISSED is auto");
assert(
  isWronglyAutoMissedSubmissionRemarks(
    "Submitted for approval but the day ended before assigner action. Original remarks: Done OT"
  ),
  "expired submit marked wrongly-auto"
);
assert(!isAutoMissedRemarks("Deepa - supervision completed"), "real work remarks not auto");
assert(!isWronglyAutoMissedSubmissionRemarks("Not done today — no staff"), "true not-done not wrongly-auto");

console.log("\n=== 2. Dedupe: completion beats not-done for same day ===");
{
  const dayKey = day("2026-08-03");
  const rows = [
    {
      _id: "1",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 10),
      status: "missed",
      kind: "not_done",
      submissionRemarks: AUTO_MISSED_REMARKS,
    },
    {
      _id: "2",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 17),
      approvedAt: day("2026-08-03", 18),
      status: "approved",
      kind: "completion",
      submissionRemarks: "Deepa - supervision done",
    },
  ];
  const out = dedupeApprovalRecords(rows);
  assert(out.length === 1, "one row after dedupe");
  assert(out[0].status === "approved", "approved completion wins over auto-missed not-done");
  assert(out[0].kind === "completion", "kind stays completion");
}

console.log("\n=== 3. Dedupe: pending completion beats pending not-done ===");
{
  const dayKey = day("2026-08-03");
  const out = dedupeApprovalRecords([
    {
      _id: "n",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 16),
      status: "pending",
      kind: "not_done",
      submissionRemarks: "Could not finish",
    },
    {
      _id: "c",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 15),
      status: "pending",
      kind: "completion",
      submissionRemarks: "All audits checked",
    },
  ]);
  assert(out.length === 1, "one pending row");
  assert(out[0].kind === "completion", "completion pending preferred over not_done pending");
  assert(out[0].status === "pending", "status remains pending (waiting for approval)");
}

console.log("\n=== 4. Dedupe: not_done_acknowledged loses to approved ===");
{
  const dayKey = day("2026-08-03");
  const out = dedupeApprovalRecords([
    {
      _id: "nd",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 16),
      approvedAt: day("2026-08-03", 18),
      status: "not_done_acknowledged",
      kind: "not_done",
      submissionRemarks: "Brain gymming content",
    },
    {
      _id: "ap",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 16),
      approvedAt: day("2026-08-03", 18),
      status: "approved",
      kind: "completion",
      submissionRemarks: "Brain gymming content",
    },
  ]);
  assert(out[0].status === "approved", "approved beats not_done_acknowledged");
}

console.log("\n=== 5. Dedupe is per-assignee (no cross-user leak) ===");
{
  const dayKey = day("2026-08-03");
  const out = dedupeApprovalRecords([
    {
      _id: "u1",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 12),
      status: "approved",
      kind: "completion",
      submissionRemarks: "User1 done",
    },
    {
      _id: "u2",
      taskId: taskA,
      assigneeId: user2,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 13),
      status: "missed",
      kind: "not_done",
      submissionRemarks: AUTO_MISSED_REMARKS,
    },
  ]);
  assert(out.length === 2, "two assignees keep separate rows");
  const byUser = Object.fromEntries(out.map((r) => [String(r.assigneeId), r.status]));
  assert(byUser[user1] === "approved", "user1 approved");
  assert(byUser[user2] === "missed", "user2 missed (own)");
}

console.log("\n=== 6. Merge live pending does not clobber stored approved ===");
{
  const dayKey = day("2026-08-03");
  const stored = [
    {
      _id: "s",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 12),
      approvedAt: day("2026-08-03", 14),
      status: "approved",
      kind: "completion",
    },
  ];
  const live = [
    {
      _id: "live-1",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 15),
      status: "pending",
      kind: "completion",
      live: true,
    },
  ];
  const merged = mergeAssigneeApprovalRows(stored, live);
  // covered key prevents live extra
  assert(merged.length === 1, "live not duplicated over stored same day");
  assert(merged[0].status === "approved", "stored approved kept when covered");
}

console.log("\n=== 7. Collapse reopen: newer pending hides older approved same day ===");
{
  const dayKey = day("2026-08-03");
  const out = collapseReopenedDuplicates([
    {
      _id: "old",
      taskId: taskB,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 10),
      approvedAt: day("2026-08-03", 11),
      status: "approved",
      kind: "completion",
    },
    {
      _id: "new",
      taskId: taskB,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 16),
      status: "pending",
      kind: "completion",
    },
  ]);
  const visible = out.filter((r) => r.status === "approved");
  // collapse should hide the older approved when pending is newer
  assert(visible.length === 0 || !out.find((r) => r._id === "old"), "old approved hidden after reopen pending");
  assert(out.some((r) => r._id === "new"), "new pending kept");
}

console.log("\n=== 8. Prune keeps latest pending only per key ===");
{
  const dayKey = day("2026-08-03");
  const out = pruneDuplicatePendingPerTask([
    {
      _id: "p1",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 10),
      status: "pending",
      kind: "completion",
    },
    {
      _id: "p2",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: dayKey,
      submittedAt: day("2026-08-03", 12),
      status: "pending",
      kind: "completion",
    },
    {
      _id: "ap",
      taskId: taskA,
      assigneeId: user1,
      occurrenceDueDate: day("2026-08-02"),
      submittedAt: day("2026-08-02", 12),
      status: "approved",
      kind: "completion",
    },
  ]);
  const pendings = out.filter((r) => r.status === "pending");
  assert(pendings.length === 1 && pendings[0]._id === "p2", "latest pending kept");
  assert(out.some((r) => r._id === "ap"), "approved on other day preserved");
}

console.log("\n=== 9. Sanitize drops future-dated auto-miss rows only ===");
{
  const future = new Date(Date.now() + 3 * 86400000);
  const past = new Date(Date.now() - 3 * 86400000);
  const out = sanitizeHistoryMissedDisplay([
    {
      _id: "f",
      status: "missed",
      kind: "not_done",
      occurrenceDueDate: future,
      submissionRemarks: AUTO_MISSED_REMARKS,
      submittedAt: future,
    },
    {
      _id: "p",
      status: "missed",
      kind: "not_done",
      occurrenceDueDate: past,
      submissionRemarks: AUTO_MISSED_REMARKS,
      submittedAt: past,
    },
    {
      _id: "a",
      status: "approved",
      kind: "completion",
      occurrenceDueDate: past,
      submissionRemarks: "ok",
      submittedAt: past,
    },
  ]);
  assert(!out.find((r) => r._id === "f"), "future missed dropped");
  assert(out.find((r) => r._id === "p"), "past missed kept");
  assert(out.find((r) => r._id === "a"), "approved kept");
}

console.log("\n=== 10. Performance status rules (frontend mirror) ===");
function statusLabel(r) {
  if (r.status === "pending") {
    return r.kind === "not_done" ? "Not done (assignee, waiting)" : "Waiting for approval";
  }
  if (r.status === "approved") return "Approved";
  if (r.status === "not_done_acknowledged") return "Not done (assignee)";
  if (r.status === "missed") {
    if (
      r.kind === "completion" ||
      r.submissionRemarks?.startsWith("Submitted for approval but the day ended") ||
      r.submissionRemarks?.startsWith("Submitted for approval but the due time passed")
    ) {
      return "Submitted (expired / not approved in time)";
    }
    if (r.kind === "not_done" && r.submissionRemarks?.trim() && !isAutoMissedRemarks(r.submissionRemarks)) {
      return "Not done (assignee)";
    }
    return "Not done (auto)";
  }
  if (r.status === "rejected") return "Rejected";
  return r.status;
}

assert(
  statusLabel({ status: "pending", kind: "completion" }) === "Waiting for approval",
  "pending completion → waiting"
);
assert(
  statusLabel({
    status: "missed",
    kind: "completion",
    submissionRemarks: "Submitted for approval but the day ended before assigner action. Original remarks: x",
  }) === "Submitted (expired / not approved in time)",
  "missed completion → submitted expired (not Not done)"
);
assert(
  statusLabel({ status: "approved", kind: "completion", submissionRemarks: "Deepa done" }) === "Approved",
  "approved stays Approved"
);
assert(
  statusLabel({ status: "not_done_acknowledged", kind: "not_done", submissionRemarks: "no staff" }) ===
    "Not done (assignee)",
  "true not-done ack label"
);
assert(
  statusLabel({ status: "missed", kind: "not_done", submissionRemarks: AUTO_MISSED_REMARKS }) === "Not done (auto)",
  "auto miss label"
);

console.log("\n=== 11. Submit-for-approval button visibility rules ===");
function canShowSubmit({ isCeo, isAssignee, personalWorkState, status, approvalStatus, assigneesLen }) {
  if (isCeo || !isAssignee) return false;
  if (status === "completed" || status === "cancelled") return false;
  // Only block when THIS user has already submitted for approval — not shared/stale awaiting.
  const personalSubmitted = personalWorkState === "submitted";
  if (personalSubmitted) return false;
  // Missing personalWorkState must still allow submit (regression guard for old UI).
  return true;
}

assert(
  canShowSubmit({
    isCeo: false,
    isAssignee: true,
    personalWorkState: "open",
    status: "awaiting_approval",
    approvalStatus: "pending",
    assigneesLen: 3,
  }),
  "shared multi awaiting still allows submit for non-submitter (personal open)"
);
assert(
  !canShowSubmit({
    isCeo: false,
    isAssignee: true,
    personalWorkState: "submitted",
    status: "awaiting_approval",
    approvalStatus: "pending",
    assigneesLen: 1,
  }),
  "already submitted → no submit button"
);
assert(
  canShowSubmit({
    isCeo: false,
    isAssignee: true,
    personalWorkState: "open",
    status: "pending",
    approvalStatus: "none",
    assigneesLen: 1,
  }),
  "open solo pending → submit shown"
);
assert(
  canShowSubmit({
    isCeo: false,
    isAssignee: true,
    personalWorkState: undefined,
    status: "awaiting_approval",
    approvalStatus: "pending",
    assigneesLen: 1,
  }),
  "missing personalWorkState + awaiting → still submit (was broken)"
);
assert(
  !canShowSubmit({
    isCeo: true,
    isAssignee: true,
    personalWorkState: "open",
    status: "pending",
    approvalStatus: "none",
    assigneesLen: 1,
  }),
  "CEO gets mark completed not submit"
);

console.log("\n=== 12. Fan-out multi-assignee create semantics (pure) ===");
function fanOutPayloads(assigneeIds, base) {
  const ids = [...new Set(assigneeIds.map(String).filter(Boolean))];
  return ids.length > 1
    ? ids.map((id) => ({ ...base, assignees: [id] }))
    : [{ ...base, assignees: ids }];
}
const created = fanOutPayloads(["a", "b", "c", "a"], { title: "Daily sheet" });
assert(created.length === 3, "3 unique assignees → 3 task payloads");
assert(created.every((p) => p.assignees.length === 1), "each payload is solo assignee");

console.log("\n=== 13. claimShared semantics (pure) ===");
function claimShared(assignees, actor) {
  const all = assignees.map(String);
  const others = all.filter((id) => id !== String(actor));
  return {
    primaryAssignees: [String(actor)],
    cloneRecipients: others,
  };
}
{
  const r = claimShared(["u1", "u2", "u3"], "u2");
  assert(r.primaryAssignees[0] === "u2", "claimer keeps original");
  assert(r.cloneRecipients.join(",") === "u1,u3", "others get clones");
}

console.log("\n=== 14. Mislabeled not_done → completion for work remarks ===");
assert(looksLikeExplicitNotDoneReason("No staff today"), "explicit not-done phrase");
assert(!looksLikeExplicitNotDoneReason("Deepa supervision done"), "work notes not not-done phrase");
{
  const fixed = reclassifyMislabeledNotDoneForDisplay([
    {
      kind: "not_done",
      status: "pending",
      submissionRemarks: "Deepa-Supervision OT check",
    },
    {
      kind: "not_done",
      status: "not_done_acknowledged",
      submissionRemarks: "1. Brain gym content",
      approvedAt: new Date(),
    },
    {
      kind: "not_done",
      status: "pending",
      submissionRemarks: "Unable to finish — no staff",
    },
  ]);
  assert(fixed[0].kind === "completion" && fixed[0].status === "pending", "work pending → waiting completion");
  assert(fixed[1].status === "approved" && fixed[1].kind === "completion", "sticky ack work → approved");
  assert(fixed[2].kind === "not_done", "true not-done reason preserved");
}

// Summary
console.log("\n----------------------------------------");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
console.log("All approval-flow unit tests passed.\n");
