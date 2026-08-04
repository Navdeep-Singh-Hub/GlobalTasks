"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { api } from "@/lib/api";
import { formatRoleLine, isCeo, isManagement } from "@/lib/roles";
import { useAuth } from "@/contexts/auth-context";
import { useCallback, useEffect, useState } from "react";
import { formatAppDateTime } from "@/lib/date-format";

type Assignee = { _id: string; name: string; email: string; role: string; executorKind?: string; active?: boolean };

type ApprovalRecord = {
  _id: string;
  taskTitle: string;
  taskType: string;
  occurrenceDueDate: string;
  submittedAt: string;
  submissionRemarks?: string;
  status: string;
  kind: string;
  approvedAt?: string | null;
  approvedBy?: { name?: string; email?: string } | null;
  rejectedAt?: string | null;
  rejectedBy?: { name?: string; email?: string } | null;
  rejectionRemarks?: string;
};

const TASK_TYPE_LABELS: Record<string, string> = {
  one_time: "One time",
  daily: "Daily",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};


function statusLabel(r: ApprovalRecord) {
  // Work notes mislabeled as not_done (backend also reclassifies; keep UI safe).
  const remarks = r.submissionRemarks?.trim() || "";
  const looksNotDoneReason = /\b(not\s*done|couldn'?t\b|could not|cannot|no staff|on leave|absent|didn'?t (do|finish)|holiday|week\s*off)\b/i.test(
    remarks
  );
  const autoOnly =
    remarks === "Not completed before the day ended — marked as not done automatically." ||
    remarks === "Not completed before the due time — marked as not done automatically." ||
    remarks === "No submission recorded for this day.";
  const expiredSubmit =
    remarks.startsWith("Submitted for approval but the day ended") ||
    remarks.startsWith("Submitted for approval but the due time passed");

  let kind = r.kind;
  let status = r.status;
  if (
    kind === "not_done" &&
    remarks &&
    !autoOnly &&
    !looksNotDoneReason
  ) {
    kind = "completion";
    if (status === "not_done_acknowledged") status = "approved";
  }
  if (expiredSubmit) {
    kind = "completion";
  }

  if (status === "pending") {
    return kind === "not_done" ? "Not done (assignee, waiting)" : "Waiting for approval";
  }
  if (status === "approved") return "Approved";
  if (status === "not_done_acknowledged") return "Not done (assignee)";
  if (status === "missed") {
    if (
      kind === "completion" ||
      expiredSubmit
    ) {
      return "Submitted (expired / not approved in time)";
    }
    if (kind === "not_done" && remarks && !isAutoMissedRemarkText(remarks)) {
      return "Not done (assignee)";
    }
    return "Not done (auto)";
  }
  if (status === "rejected") return "Rejected";
  return status;
}

function isAutoMissedRemarkText(text: string) {
  const t = text.trim();
  return (
    t === "Not completed before the day ended — marked as not done automatically." ||
    t === "Not completed before the due time — marked as not done automatically." ||
    t === "No submission recorded for this day." ||
    t.startsWith("Submitted for approval but the day ended") ||
    t.startsWith("Submitted for approval but the due time passed")
  );
}

function autoMissedSubmittedLabel(r: ApprovalRecord) {
  const due = formatAppDateTime(r.occurrenceDueDate);
  const remarks = r.submissionRemarks?.trim() || "";
  if (remarks.startsWith("Submitted for approval but the due time passed")) {
    return `Auto — due time passed (${due})`;
  }
  if (remarks === "Not completed before the due time — marked as not done automatically.") {
    return `Auto — due time passed (${due})`;
  }
  if (remarks.startsWith("Submitted for approval but the day ended")) {
    return `Auto — day ended (${due})`;
  }
  return `Auto — not done (${due})`;
}

function submittedLabel(r: ApprovalRecord) {
  if (r.status === "missed" && (!r.submissionRemarks?.trim() || isAutoMissedRemarkText(r.submissionRemarks))) {
    return autoMissedSubmittedLabel(r);
  }
  return formatAppDateTime(r.submittedAt);
}

function remarksDisplay(r: ApprovalRecord) {
  if (r.status === "missed") {
    if (r.submissionRemarks?.trim() && !isAutoMissedRemarkText(r.submissionRemarks)) {
      return r.submissionRemarks.trim();
    }
    const remarks = r.submissionRemarks?.trim();
    if (remarks === "Not completed before the due time — marked as not done automatically.") {
      return remarks;
    }
    return remarks || "Not completed before the day ended.";
  }
  return r.submissionRemarks?.trim() || "—";
}

function RemarksCell({ record }: { record: ApprovalRecord }) {
  const [open, setOpen] = useState(false);
  const text = remarksDisplay(record);
  const rejection = record.rejectionRemarks?.trim() || "";
  const hasContent = text !== "—" || Boolean(rejection);
  if (!hasContent) return <span className="text-zinc-400">—</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="max-w-[220px] text-left text-xs text-zinc-600 transition hover:text-brand-700 dark:text-zinc-300 dark:hover:text-brand-300"
        title="Click to view full remarks"
      >
        <span className="line-clamp-2">{text}</span>
        {rejection ? (
          <span className="mt-1 block line-clamp-1 text-rose-600">Reject: {rejection}</span>
        ) : null}
        <span className="mt-0.5 block text-[10px] font-medium text-brand-600 dark:text-brand-400">View full</span>
      </button>
      <Modal open={open} title="Remarks" onClose={() => setOpen(false)}>
        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Submission</div>
            <p className="whitespace-pre-wrap break-words text-zinc-800 dark:text-zinc-100">
              {text === "—" ? "No submission remarks." : text}
            </p>
          </div>
          {rejection ? (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-600">Rejection</div>
              <p className="whitespace-pre-wrap break-words text-rose-700 dark:text-rose-300">{rejection}</p>
            </div>
          ) : null}
          {record.taskTitle ? (
            <p className="border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
              Task: {record.taskTitle}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function occurrenceDueLabel(r: ApprovalRecord) {
  return formatAppDateTime(r.occurrenceDueDate);
}

function closedLabel(r: ApprovalRecord) {
  if (r.status === "pending") return "—";
  return formatAppDateTime(r.approvedAt || r.rejectedAt);
}

export function AssigneeApprovalHistory() {
  const { user } = useAuth();
  const isCeoUser = isCeo(user?.role);
  const canUse = Boolean(user?.role && (isManagement(user.role) || isCeoUser));

  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, notDone: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canUse) return;
    api<{ assignees: Assignee[] }>("/dashboard/my-assignees")
      .then((d) => setAssignees(d.assignees || []))
      .catch(() => setAssignees([]));
  }, [canUse]);

  const loadHistory = useCallback(async (withSync = false) => {
    if (!assigneeId) {
      setRecords([]);
      setSummary({ total: 0, pending: 0, approved: 0, rejected: 0, notDone: 0 });
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ assigneeId });
      if (withSync) qs.set("sync", "true");
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      qs.set("limit", "250");
      const d = await api<{ records: ApprovalRecord[]; summary: typeof summary }>(
        `/dashboard/assignee-approval-history?${qs.toString()}`
      );
      setRecords(d.records || []);
      setSummary(d.summary || { total: 0, pending: 0, approved: 0, rejected: 0, notDone: 0 });
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [assigneeId, from, to]);

  useEffect(() => {
    if (!assigneeId) return;
    const handle = window.setTimeout(() => void loadHistory(false), from || to ? 400 : 0);
    return () => window.clearTimeout(handle);
  }, [assigneeId, from, to, loadHistory]);

  if (!canUse) return null;

  const selected = assignees.find((a) => a._id === assigneeId);

  return (
    <div className="glass-card rounded-2xl border-brand-200/40 p-4 sm:rounded-2xl sm:p-5 dark:border-brand-800/30">
      <h2 className="bg-brand-gradient bg-clip-text text-lg font-bold text-transparent">Task approval history</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {isCeoUser
          ? "Select any team member to see their full submit / approve / not-done history across the organisation."
          : "Everyone you have ever assigned a task to appears below — the same full daily history for each person. Every scheduled day since assignment is shown: approved, waiting, or not done."}{" "}
        Clear the date filters to see full history for any team member.
      </p>
      {!assignees.length ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          No assignees found yet. Assign tasks from <strong>Assign Task</strong>, then history will appear here after people
          submit for approval.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-semibold text-zinc-500">Team member</span>
          <SearchableSelect
            value={assigneeId}
            onChange={setAssigneeId}
            placeholder="Select person…"
            searchPlaceholder="Search name or email…"
            options={assignees.map((a) => ({
              value: a._id,
              label: `${a.name} (${a.email})${a.active === false ? " · inactive" : ""}`,
              searchText: `${a.name} ${a.email}`,
            }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-zinc-500">From</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-zinc-500">To</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {selected && (
        <div className="mt-3 text-xs text-zinc-500">
          {formatRoleLine(selected.role, selected.executorKind)} · {selected.email}
        </div>
      )}

      {assigneeId && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="rounded-lg bg-zinc-50 p-2 text-center text-xs dark:bg-zinc-900">
              <div className="font-semibold text-zinc-500">Total</div>
              <div className="text-lg font-bold">{summary.total}</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-2 text-center text-xs dark:bg-amber-950/40">
              <div className="font-semibold text-amber-700">Waiting for approval</div>
              <div className="text-lg font-bold">{summary.pending}</div>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2 text-center text-xs dark:bg-emerald-950/40">
              <div className="font-semibold text-emerald-700">Approved</div>
              <div className="text-lg font-bold">{summary.approved}</div>
            </div>
            <div className="rounded-lg bg-rose-50 p-2 text-center text-xs dark:bg-rose-950/40">
              <div className="font-semibold text-rose-700">Rejected</div>
              <div className="text-lg font-bold">{summary.rejected}</div>
            </div>
            <div className="rounded-lg bg-violet-50 p-2 text-center text-xs dark:bg-violet-950/40">
              <div className="font-semibold text-violet-700">Not done</div>
              <div className="text-lg font-bold">{summary.notDone}</div>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadHistory(true)}>
              {loading ? "Loading…" : "Refresh & sync"}
            </Button>
          </div>

          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Task</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Due (occurrence)</th>
                  <th className="px-2 py-2">Submitted</th>
                  <th className="px-2 py-2">Approved / rejected</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r._id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-2 font-medium">{r.taskTitle}</td>
                    <td className="px-2 py-2">{TASK_TYPE_LABELS[r.taskType] || r.taskType}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{occurrenceDueLabel(r)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{submittedLabel(r)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{closedLabel(r)}</td>
                    <td className="px-2 py-2">
                      <span
                        className={
                          statusLabel(r) === "Approved"
                            ? "text-emerald-600"
                            : statusLabel(r).startsWith("Not done (auto)")
                              ? "text-violet-600"
                              : statusLabel(r).startsWith("Not done")
                                ? "text-teal-700"
                            : r.status === "rejected" || statusLabel(r) === "Rejected"
                              ? "text-rose-600"
                              : "font-medium text-amber-600"
                        }
                      >
                        {statusLabel(r)}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <RemarksCell record={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-2 md:hidden">
            {records.map((r) => (
              <div key={`m-${r._id}`} className="rounded-lg border border-zinc-200/80 p-3 text-xs dark:border-zinc-800">
                <div className="font-semibold">{r.taskTitle}</div>
                <div className="mt-1 text-zinc-500">
                  {TASK_TYPE_LABELS[r.taskType] || r.taskType} · {statusLabel(r)}
                </div>
                <div className="mt-2 grid gap-1 text-zinc-600 dark:text-zinc-300">
                  <div>Due: {occurrenceDueLabel(r)}</div>
                  <div>Submitted: {submittedLabel(r)}</div>
                  <div>Approved/rejected: {closedLabel(r)}</div>
                  <div className="mt-1">
                    <RemarksCell record={r} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {loading ? (
            <p className="mt-4 text-center text-sm text-zinc-500">Loading history…</p>
          ) : !records.length && assigneeId ? (
            <p className="mt-4 text-center text-sm text-zinc-500">
              No approval activity for this person in the selected dates. Clear <strong>From</strong> and <strong>To</strong> and
              click Refresh — or wait until they submit and you approve new tasks (history is recorded from then on).
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
