"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { formatRoleLine, isManagement } from "@/lib/roles";
import { Activity, ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

type SupervisorUser = { _id: string; name: string; email: string; role: string; executorKind?: string };
type SummaryRow = {
  _id: string;
  supervisor: { _id: string; name: string; email: string };
  daysSubmitted: number;
  yesCount: number;
  noCount: number;
  remarksCount: number;
  lastUpdatedAt?: string | null;
};
type DetailSheet = {
  _id: string;
  sheetDate: string;
  entries: { taskKey: string; status: "yes" | "no"; remarks?: string }[];
};

const TASK_LABELS: Record<string, string> = {
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

function taskLabel(taskKey: string) {
  return TASK_LABELS[taskKey] || taskKey;
}

export default function SupervisorPerformancePage() {
  const { user } = useAuth();
  const canManage = isManagement(user?.role);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [supervisors, setSupervisors] = useState<SupervisorUser[]>([]);
  const [supervisorId, setSupervisorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detailsBySupervisor, setDetailsBySupervisor] = useState<
    Record<string, { loading: boolean; loaded: boolean; error: string; sheets: DetailSheet[] }>
  >({});

  useEffect(() => {
    if (!user) return;
    api<{ users: SupervisorUser[] }>("/users")
      .then((d) => setSupervisors(d.users.filter((u) => u.role === "supervisor")))
      .catch(() => setSupervisors([]));
  }, [user]);

  useEffect(() => {
    setPage(1);
  }, [supervisorId, from, to]);

  useEffect(() => {
    if (!user) return;
    const qs = new URLSearchParams();
    if (supervisorId) qs.set("supervisorId", supervisorId);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("page", String(page));
    qs.set("limit", "25");
    api<{ rows: SummaryRow[]; total?: number }>(`/reports/supervisor-performance?${qs.toString()}`)
      .then((d) => {
        setRows(d.rows || []);
        setTotal(Number(d.total) || 0);
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
      });
  }, [user, supervisorId, from, to, page]);

  useEffect(() => {
    setExpanded({});
    setDetailsBySupervisor({});
  }, [supervisorId, from, to, page]);

  const totals = useMemo(
    () => ({
      yes: rows.reduce((sum, r) => sum + (r.yesCount || 0), 0),
      no: rows.reduce((sum, r) => sum + (r.noCount || 0), 0),
    }),
    [rows]
  );

  async function loadDetails(id: string) {
    const existing = detailsBySupervisor[id];
    if (existing?.loading || existing?.loaded) return;
    setDetailsBySupervisor((prev) => ({ ...prev, [id]: { loading: true, loaded: false, error: "", sheets: [] } }));
    try {
      const qs = new URLSearchParams();
      qs.set("supervisorId", id);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      qs.set("page", "1");
      qs.set("limit", "200");
      const d = await api<{ sheets: DetailSheet[] }>(`/reports/supervisor-performance/details?${qs.toString()}`);
      setDetailsBySupervisor((prev) => ({ ...prev, [id]: { loading: false, loaded: true, error: "", sheets: d.sheets || [] } }));
    } catch (e) {
      setDetailsBySupervisor((prev) => ({
        ...prev,
        [id]: { loading: false, loaded: true, error: e instanceof Error ? e.message : "Could not load details", sheets: [] },
      }));
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-bold">Supervisor Performance</h1>
        <p className="mt-2 text-sm text-zinc-500">This page is visible to upper-level roles only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <Activity className="h-3 w-3" /> Supervisor tracker
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Supervisor Performance</h1>
        <p className="mt-1 text-sm text-zinc-500">Supervisor sheet summaries and date-wise task details.</p>
      </div>

      <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-zinc-500">Supervisor</span>
            <Select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
              <option value="">All supervisors</option>
              {supervisors.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({formatRoleLine(s.role, s.executorKind)})
                </option>
              ))}
            </Select>
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
        <h2 className="text-lg font-bold">Supervisor Measurements</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Showing {rows.length} of {total} supervisor records.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Supervisor</th>
                <th className="px-2 py-2">Days Submitted</th>
                <th className="px-2 py-2">Yes</th>
                <th className="px-2 py-2">No</th>
                <th className="px-2 py-2">Remarks</th>
                <th className="px-2 py-2">Last Update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
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
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-zinc-500">
                    No supervisor records for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
        <h2 className="text-lg font-bold">Supervisor Sheet Details (Date-wise)</h2>
        <p className="mt-1 text-xs text-zinc-500">Click a supervisor to expand saved sheet entries by date.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Supervisor</th>
                <th className="px-2 py-2 text-right">Days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = Boolean(expanded[r._id]);
                const detail = detailsBySupervisor[r._id];
                return (
                  <Fragment key={r._id}>
                    <tr
                      className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                      onClick={() => {
                        const willOpen = !open;
                        setExpanded((prev) => ({ ...prev, [r._id]: willOpen }));
                        if (willOpen) void loadDetails(r._id);
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
                                  <div className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{sheet.sheetDate}</div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full min-w-[560px] text-xs">
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
                                            <td className="px-2 py-1.5">{taskLabel(e.taskKey)}</td>
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
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
