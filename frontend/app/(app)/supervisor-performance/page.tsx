"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { CoordinatorRemarksDisplay } from "@/components/therapist/coordinator-remarks-display";
import { cn } from "@/lib/utils";
import { formatRoleLine, isManagement } from "@/lib/roles";
import { Activity, ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

type SheetKind = "supervisor" | "coordinator";

type PersonUser = { _id: string; name: string; email: string; role: string; executorKind?: string };

type SupervisorSummaryRow = {
  _id: string;
  supervisor: { _id: string; name: string; email: string };
  daysSubmitted: number;
  yesCount: number;
  noCount: number;
  remarksCount: number;
  lastUpdatedAt?: string | null;
};

type CoordinatorSummaryRow = {
  _id: string;
  coordinator: { _id: string; name: string; email: string };
  daysSubmitted: number;
  yesCount: number;
  noCount: number;
  remarksCount: number;
  lastUpdatedAt?: string | null;
};

type DetailSheet = {
  _id: string;
  sheetDate: string;
  instanceKey?: string;
  label?: string;
  entries: { taskKey: string; status: "yes" | "no"; remarks?: string }[];
};

const SUPERVISOR_TASK_LABELS: Record<string, string> = {
  "observe-therapy-sessions": "Observe therapy sessions",
  "therapy-plan-check": "Therapy plan check",
  "supervisor-round-notes": "Supervisor round notes complete",
  "ensure-therapy-notes-complete": "Ensure therapy notes are complete",
  "weekly-review-with-coordinators":
    "Conduct weekly meetings with coordinators to review therapy progress, operational issues and departmental workflow",
  "weekly-staff-training": "Conduct weekly staff training and skill development sessions",
  "team-utilized-free-session": "How team utilized free session of therapist",
  "alternative-session": "Alternative session",
};

const COORDINATOR_TASK_LABELS: Record<string, string> = {
  "parent-meeting": "Parent meeting",
  "rounds-of-centre": "Rounds of centre",
  "opd-meeting-parents": "OPD meeting with parents",
  "new-parents-waiting-package": "New parents waiting for package",
  "send-videos-daily-sessions": "Send videos of daily sessions",
  "parenting-session": "Parenting session",
  "session-observation": "Session observation",
  "g-form-filling": "G-Form filling",
};

function taskLabel(taskKey: string, kind: SheetKind) {
  if (kind === "coordinator") return COORDINATOR_TASK_LABELS[taskKey] || taskKey;
  return SUPERVISOR_TASK_LABELS[taskKey] || taskKey;
}

export default function SupervisorPerformancePage() {
  const { user } = useAuth();
  const canManage = isManagement(user?.role);
  const [sheetKind, setSheetKind] = useState<SheetKind>("supervisor");

  const [supRows, setSupRows] = useState<SupervisorSummaryRow[]>([]);
  const [supTotal, setSupTotal] = useState(0);
  const [coordRows, setCoordRows] = useState<CoordinatorSummaryRow[]>([]);
  const [coordTotal, setCoordTotal] = useState(0);

  const [page, setPage] = useState(1);
  const [supervisors, setSupervisors] = useState<PersonUser[]>([]);
  const [coordinators, setCoordinators] = useState<PersonUser[]>([]);
  const [supervisorId, setSupervisorId] = useState("");
  const [coordinatorId, setCoordinatorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detailsById, setDetailsById] = useState<
    Record<string, { loading: boolean; loaded: boolean; error: string; sheets: DetailSheet[] }>
  >({});

  useEffect(() => {
    if (!user) return;
    api<{ users: PersonUser[] }>("/users")
      .then((d) => {
        const list = d.users || [];
        setSupervisors(list.filter((u) => u.role === "supervisor"));
        setCoordinators(list.filter((u) => u.role === "coordinator"));
      })
      .catch(() => {
        setSupervisors([]);
        setCoordinators([]);
      });
  }, [user]);

  useEffect(() => {
    setPage(1);
  }, [supervisorId, coordinatorId, from, to, sheetKind]);

  useEffect(() => {
    if (!user || sheetKind !== "supervisor") return;
    const qs = new URLSearchParams();
    if (supervisorId) qs.set("supervisorId", supervisorId);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    qs.set("limit", "25");
    api<{ rows: SupervisorSummaryRow[]; total?: number }>(`/reports/supervisor-performance?${qs.toString()}`)
      .then((d) => {
        setSupRows(d.rows || []);
        setSupTotal(Number(d.total) || 0);
      })
      .catch(() => {
        setSupRows([]);
        setSupTotal(0);
      });
  }, [user, sheetKind, supervisorId, from, to, page]);

  useEffect(() => {
    if (!user || sheetKind !== "coordinator") return;
    const qs = new URLSearchParams();
    if (coordinatorId) qs.set("coordinatorId", coordinatorId);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    qs.set("limit", "25");
    api<{ rows: CoordinatorSummaryRow[]; total?: number }>(`/reports/coordinator-performance?${qs.toString()}`)
      .then((d) => {
        setCoordRows(d.rows || []);
        setCoordTotal(Number(d.total) || 0);
      })
      .catch(() => {
        setCoordRows([]);
        setCoordTotal(0);
      });
  }, [user, sheetKind, coordinatorId, from, to, page]);

  useEffect(() => {
    setExpanded({});
    setDetailsById({});
  }, [supervisorId, coordinatorId, from, to, page, sheetKind]);

  const rows = sheetKind === "supervisor" ? supRows : coordRows;
  const total = sheetKind === "supervisor" ? supTotal : coordTotal;

  const totals = useMemo(
    () => ({
      yes: rows.reduce((sum, r) => sum + (r.yesCount || 0), 0),
      no: rows.reduce((sum, r) => sum + (r.noCount || 0), 0),
    }),
    [rows]
  );

  async function loadSupervisorDetails(id: string) {
    const existing = detailsById[id];
    if (existing?.loading || existing?.loaded) return;
    setDetailsById((prev) => ({ ...prev, [id]: { loading: true, loaded: false, error: "", sheets: [] } }));
    try {
      const qs = new URLSearchParams();
      qs.set("supervisorId", id);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      qs.set("page", "1");
      qs.set("limit", "200");
      const d = await api<{ sheets: DetailSheet[] }>(`/reports/supervisor-performance/details?${qs.toString()}`);
      setDetailsById((prev) => ({ ...prev, [id]: { loading: false, loaded: true, error: "", sheets: d.sheets || [] } }));
    } catch (e) {
      setDetailsById((prev) => ({
        ...prev,
        [id]: { loading: false, loaded: true, error: e instanceof Error ? e.message : "Could not load details", sheets: [] },
      }));
    }
  }

  async function loadCoordinatorDetails(id: string) {
    const existing = detailsById[id];
    if (existing?.loading || existing?.loaded) return;
    setDetailsById((prev) => ({ ...prev, [id]: { loading: true, loaded: false, error: "", sheets: [] } }));
    try {
      const qs = new URLSearchParams();
      qs.set("coordinatorId", id);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      qs.set("page", "1");
      qs.set("limit", "200");
      const d = await api<{ sheets: DetailSheet[] }>(`/reports/coordinator-performance/details?${qs.toString()}`);
      setDetailsById((prev) => ({ ...prev, [id]: { loading: false, loaded: true, error: "", sheets: d.sheets || [] } }));
    } catch (e) {
      setDetailsById((prev) => ({
        ...prev,
        [id]: { loading: false, loaded: true, error: e instanceof Error ? e.message : "Could not load details", sheets: [] },
      }));
    }
  }

  function loadDetails(id: string) {
    if (sheetKind === "supervisor") void loadSupervisorDetails(id);
    else void loadCoordinatorDetails(id);
  }

  const roleLabel = sheetKind === "supervisor" ? "Supervisor" : "Coordinator";
  const emptyMessage =
    sheetKind === "supervisor" ? "No supervisor records for selected filters." : "No coordinator records for selected filters.";

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-bold">Sheet performance</h1>
        <p className="mt-2 text-sm text-zinc-500">This page is visible to management roles only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <Activity className="h-3 w-3" /> Daily sheet tracker
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Supervisor & coordinator performance</h1>
        <p className="mt-1 text-sm text-zinc-500">Supervisor and coordinator daily sheet summaries and date-wise task details.</p>
        <div className="mt-4 inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setSheetKind("supervisor")}
            className={cn(
              "rounded-lg px-4 py-2 text-xs font-semibold transition-colors",
              sheetKind === "supervisor"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            )}
          >
            Supervisors
          </button>
          <button
            type="button"
            onClick={() => setSheetKind("coordinator")}
            className={cn(
              "rounded-lg px-4 py-2 text-xs font-semibold transition-colors",
              sheetKind === "coordinator"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            )}
          >
            Coordinators
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-zinc-500">{roleLabel}</span>
            {sheetKind === "supervisor" ? (
              <Select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
                <option value="">All supervisors</option>
                {supervisors.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({formatRoleLine(s.role, s.executorKind)})
                  </option>
                ))}
              </Select>
            ) : (
              <Select value={coordinatorId} onChange={(e) => setCoordinatorId(e.target.value)}>
                <option value="">All coordinators</option>
                {coordinators.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({formatRoleLine(c.role, c.executorKind)})
                  </option>
                ))}
              </Select>
            )}
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-zinc-500">From</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-zinc-500">To</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div className="font-semibold">Overview</div>
            <div className="mt-1 text-zinc-500">
              Yes: {totals.yes} · No: {totals.no}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl sm:p-5">
        <h2 className="text-lg font-bold">{roleLabel} measurements</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Showing {rows.length} of {total} {sheetKind === "supervisor" ? "supervisor" : "coordinator"} records.
        </p>
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">{roleLabel}</th>
                <th className="px-2 py-2">Days Submitted</th>
                <th className="px-2 py-2">Yes</th>
                <th className="px-2 py-2">No</th>
                <th className="px-2 py-2">Remarks</th>
                <th className="px-2 py-2">Last Update</th>
              </tr>
            </thead>
            <tbody>
              {sheetKind === "supervisor"
                ? supRows.map((r) => (
                    <tr key={r._id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-2 py-2">
                        <div className="font-semibold">{r.supervisor.name}</div>
                        <div className="text-xs text-zinc-500">{r.supervisor.email}</div>
                      </td>
                      <td className="px-2 py-2">{r.daysSubmitted}</td>
                      <td className="px-2 py-2">{r.yesCount}</td>
                      <td className="px-2 py-2">{r.noCount}</td>
                      <td className="px-2 py-2">{r.remarksCount}</td>
                      <td className="px-2 py-2">{r.lastUpdatedAt ? new Date(r.lastUpdatedAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))
                : coordRows.map((r) => (
                    <tr key={r._id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-2 py-2">
                        <div className="font-semibold">{r.coordinator.name}</div>
                        <div className="text-xs text-zinc-500">{r.coordinator.email}</div>
                      </td>
                      <td className="px-2 py-2">{r.daysSubmitted}</td>
                      <td className="px-2 py-2">{r.yesCount}</td>
                      <td className="px-2 py-2">{r.noCount}</td>
                      <td className="px-2 py-2">{r.remarksCount}</td>
                      <td className="px-2 py-2">{r.lastUpdatedAt ? new Date(r.lastUpdatedAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-zinc-500">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-2 md:hidden">
          {sheetKind === "supervisor"
            ? supRows.map((r) => (
                <div key={`m-${r._id}`} className="rounded-lg border border-zinc-200/80 p-3 text-sm dark:border-zinc-800">
                  <div className="font-semibold">{r.supervisor.name}</div>
                  <div className="text-xs text-zinc-500">{r.supervisor.email}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">Days: {r.daysSubmitted}</div>
                    <div className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">Yes: {r.yesCount}</div>
                    <div className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">No: {r.noCount}</div>
                    <div className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">Remarks: {r.remarksCount}</div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Last update: {r.lastUpdatedAt ? new Date(r.lastUpdatedAt).toLocaleString() : "—"}
                  </div>
                </div>
              ))
            : coordRows.map((r) => (
                <div key={`m-${r._id}`} className="rounded-lg border border-zinc-200/80 p-3 text-sm dark:border-zinc-800">
                  <div className="font-semibold">{r.coordinator.name}</div>
                  <div className="text-xs text-zinc-500">{r.coordinator.email}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">Days: {r.daysSubmitted}</div>
                    <div className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">Yes: {r.yesCount}</div>
                    <div className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">No: {r.noCount}</div>
                    <div className="rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-900">Remarks: {r.remarksCount}</div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Last update: {r.lastUpdatedAt ? new Date(r.lastUpdatedAt).toLocaleString() : "—"}
                  </div>
                </div>
              ))}
          {!rows.length && <div className="py-6 text-center text-sm text-zinc-500">{emptyMessage}</div>}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
          <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span className="text-center text-xs text-zinc-500 sm:px-2">Page {page}</span>
          <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl sm:p-5">
        <h2 className="text-lg font-bold">{roleLabel} sheet details (date-wise)</h2>
        <p className="mt-1 text-xs text-zinc-500">Click a row to expand saved sheet entries by date.</p>
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">{roleLabel}</th>
                <th className="px-2 py-2 text-right">Days</th>
              </tr>
            </thead>
            <tbody>
              {sheetKind === "supervisor"
                ? supRows.map((r) => {
                    const open = Boolean(expanded[r._id]);
                    const detail = detailsById[r._id];
                    return (
                      <Fragment key={r._id}>
                        <tr
                          className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                          onClick={() => {
                            const willOpen = !open;
                            setExpanded((prev) => ({ ...prev, [r._id]: willOpen }));
                            if (willOpen) loadDetails(r._id);
                          }}
                        >
                          <td className="px-2 py-2">
                            <div className="flex items-start gap-2">
                              {open ? <ChevronDown className="mt-0.5 h-4 w-4 text-zinc-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-zinc-500" />}
                              <div>
                                <div className="font-semibold">{r.supervisor.name}</div>
                                <div className="text-xs text-zinc-500">{r.supervisor.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">{r.daysSubmitted}</td>
                        </tr>
                        {open && (
                          <tr className="border-t border-zinc-100 dark:border-zinc-800">
                            <td colSpan={2} className="px-2 py-2">
                              {detail?.loading ? (
                                <div className="text-xs text-zinc-500">Loading details…</div>
                              ) : detail?.error ? (
                                <div className="text-xs text-rose-600">{detail.error}</div>
                              ) : detail?.loaded && detail.sheets.length ? (
                                <div className="space-y-3">
                                  {detail.sheets.map((sheet) => (
                                    <div key={sheet._id} className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800">
                                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                                        <span>{sheet.sheetDate}</span>
                                        {sheet.instanceKey && sheet.instanceKey !== "default" && (
                                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                            {String(sheet.label || "").trim() || "Extra sheet"}
                                          </span>
                                        )}
                                      </div>
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead className="text-left uppercase text-zinc-500">
                                            <tr>
                                              <th className="px-2 py-1">Task</th>
                                              <th className="px-2 py-1">Status</th>
                                              <th className="px-2 py-1">Remarks</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {sheet.entries.map((e, idx) => (
                                              <tr key={`${sheet._id}-${e.taskKey}-${idx}`} className="border-t border-zinc-100 dark:border-zinc-800">
                                                <td className="px-2 py-1.5">{taskLabel(e.taskKey, "supervisor")}</td>
                                                <td className="px-2 py-1.5 uppercase">{e.status}</td>
                                                <td className="px-2 py-1.5">{e.remarks || "—"}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-zinc-500">No details found for selected range.</div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                : coordRows.map((r) => {
                    const open = Boolean(expanded[r._id]);
                    const detail = detailsById[r._id];
                    return (
                      <Fragment key={r._id}>
                        <tr
                          className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                          onClick={() => {
                            const willOpen = !open;
                            setExpanded((prev) => ({ ...prev, [r._id]: willOpen }));
                            if (willOpen) loadDetails(r._id);
                          }}
                        >
                          <td className="px-2 py-2">
                            <div className="flex items-start gap-2">
                              {open ? <ChevronDown className="mt-0.5 h-4 w-4 text-zinc-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-zinc-500" />}
                              <div>
                                <div className="font-semibold">{r.coordinator.name}</div>
                                <div className="text-xs text-zinc-500">{r.coordinator.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right">{r.daysSubmitted}</td>
                        </tr>
                        {open && (
                          <tr className="border-t border-zinc-100 dark:border-zinc-800">
                            <td colSpan={2} className="px-2 py-2">
                              {detail?.loading ? (
                                <div className="text-xs text-zinc-500">Loading details…</div>
                              ) : detail?.error ? (
                                <div className="text-xs text-rose-600">{detail.error}</div>
                              ) : detail?.loaded && detail.sheets.length ? (
                                <div className="space-y-3">
                                  {detail.sheets.map((sheet) => (
                                    <div key={sheet._id} className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800">
                                      <div className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{sheet.sheetDate}</div>
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead className="text-left uppercase text-zinc-500">
                                            <tr>
                                              <th className="px-2 py-1">Task</th>
                                              <th className="px-2 py-1">Status</th>
                                              <th className="px-2 py-1">Remarks</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {sheet.entries.map((e, idx) => (
                                              <tr key={`${sheet._id}-${e.taskKey}-${idx}`} className="border-t border-zinc-100 dark:border-zinc-800">
                                                <td className="px-2 py-1.5 align-top">{taskLabel(e.taskKey, "coordinator")}</td>
                                                <td className="px-2 py-1.5 align-top uppercase">{e.status}</td>
                                                <td className="max-w-[min(96vw,720px)] px-2 py-1.5 align-top">
                                                  <CoordinatorRemarksDisplay taskKey={e.taskKey} remarks={e.remarks} />
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-zinc-500">No details found for selected range.</div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-2 md:hidden">
          {sheetKind === "supervisor"
            ? supRows.map((r) => {
                const open = Boolean(expanded[r._id]);
                const detail = detailsById[r._id];
                return (
                  <div key={`d-${r._id}`} className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => {
                        const willOpen = !open;
                        setExpanded((prev) => ({ ...prev, [r._id]: willOpen }));
                        if (willOpen) loadDetails(r._id);
                      }}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold">{r.supervisor.name}</div>
                        <div className="truncate text-xs text-zinc-500">{r.supervisor.email}</div>
                      </div>
                      <div className="shrink-0 text-xs text-zinc-500">
                        {open ? "Hide" : "View"} ({r.daysSubmitted} days)
                      </div>
                    </button>
                    {open && (
                      <div className="mt-2 space-y-2">
                        {detail?.loading ? (
                          <div className="text-xs text-zinc-500">Loading details…</div>
                        ) : detail?.error ? (
                          <div className="text-xs text-rose-600">{detail.error}</div>
                        ) : detail?.loaded && detail.sheets.length ? (
                          detail.sheets.map((sheet) => (
                            <div key={sheet._id} className="rounded-md border border-zinc-200/80 p-2 dark:border-zinc-800">
                              <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                                {sheet.sheetDate}
                                {sheet.instanceKey && sheet.instanceKey !== "default" ? ` · ${String(sheet.label || "").trim() || "Extra sheet"}` : ""}
                              </div>
                              <div className="space-y-1">
                                {sheet.entries.map((e, idx) => (
                                  <div key={`${sheet._id}-${e.taskKey}-${idx}`} className="rounded bg-zinc-50 px-2 py-1 text-xs dark:bg-zinc-900">
                                    <div className="font-medium">{taskLabel(e.taskKey, "supervisor")}</div>
                                    <div className="text-zinc-500">
                                      {String(e.status || "").toUpperCase()} · {e.remarks || "—"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-zinc-500">No details found for selected range.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            : coordRows.map((r) => {
                const open = Boolean(expanded[r._id]);
                const detail = detailsById[r._id];
                return (
                  <div key={`d-${r._id}`} className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => {
                        const willOpen = !open;
                        setExpanded((prev) => ({ ...prev, [r._id]: willOpen }));
                        if (willOpen) loadDetails(r._id);
                      }}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold">{r.coordinator.name}</div>
                        <div className="truncate text-xs text-zinc-500">{r.coordinator.email}</div>
                      </div>
                      <div className="shrink-0 text-xs text-zinc-500">
                        {open ? "Hide" : "View"} ({r.daysSubmitted} days)
                      </div>
                    </button>
                    {open && (
                      <div className="mt-2 space-y-2">
                        {detail?.loading ? (
                          <div className="text-xs text-zinc-500">Loading details…</div>
                        ) : detail?.error ? (
                          <div className="text-xs text-rose-600">{detail.error}</div>
                        ) : detail?.loaded && detail.sheets.length ? (
                          detail.sheets.map((sheet) => (
                            <div key={sheet._id} className="rounded-md border border-zinc-200/80 p-2 dark:border-zinc-800">
                              <div className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{sheet.sheetDate}</div>
                              <div className="space-y-1">
                                {sheet.entries.map((e, idx) => (
                                  <div key={`${sheet._id}-${e.taskKey}-${idx}`} className="rounded border border-zinc-100 bg-zinc-50/90 px-2 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{taskLabel(e.taskKey, "coordinator")}</div>
                                    <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Status</div>
                                    <div className="text-zinc-700 dark:text-zinc-300">{String(e.status || "").toUpperCase()}</div>
                                    <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Remarks</div>
                                    <div className="mt-0.5">
                                      <CoordinatorRemarksDisplay taskKey={e.taskKey} remarks={e.remarks} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-zinc-500">No details found for selected range.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
