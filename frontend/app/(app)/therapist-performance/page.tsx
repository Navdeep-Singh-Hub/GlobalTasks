"use client";

import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, api, assetUrl } from "@/lib/api";
import { formatRoleLine, isManagement } from "@/lib/roles";
import { Activity, ChevronDown, ChevronRight, Star } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type TherapistUser = { _id: string; name: string; email: string; role: string; executorKind?: string };
type SessionItem = {
  _id: string;
  sessionDate: string;
  patientName: string;
  patientCode?: string;
  startedAt?: string;
  endedAt?: string;
  durationMinutes?: number;
  videoUrl?: string;
  planUpdated15d?: boolean;
  newActivity15d?: boolean;
  newActivityText?: string;
  monthlyTestDone?: boolean;
  monthlyTestNotes?: string;
  supervisorScore?: number;
  supervisorRemarks?: string;
  therapistId: TherapistUser;
  markedBy?: { _id: string; name: string } | null;
};
type PerformanceRow = {
  _id: string;
  therapist: { _id: string; name: string; email: string; centerId?: { name?: string } | null };
  sessions: number;
  patientsCovered: number;
  attendanceDays: number;
  planUpdates15d: number;
  newActivities15d: number;
  monthlyTests: number;
  avgSupervisorScore: number;
};

export default function TherapistPerformancePage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [therapists, setTherapists] = useState<TherapistUser[]>([]);
  const [therapistId, setTherapistId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scoreDraft, setScoreDraft] = useState<Record<string, { score: string; remarks: string }>>({});
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [expandedSessionTherapists, setExpandedSessionTherapists] = useState<Record<string, boolean>>({});

  const canManage = isManagement(user?.role);
  const canMark = user?.role === "supervisor";

  const load = useCallback(async () => {
    const qsPerf = new URLSearchParams();
    const qsSessions = new URLSearchParams();
    if (therapistId) {
      qsPerf.set("therapistId", therapistId);
      qsSessions.set("therapistId", therapistId);
    }
    if (from) {
      qsPerf.set("from", from);
      qsSessions.set("from", from);
    }
    if (to) {
      qsPerf.set("to", to);
      qsSessions.set("to", to);
    }
    qsPerf.set("page", String(page));
    qsPerf.set("limit", "25");
    qsSessions.set("page", String(sessionsPage));
    qsSessions.set("limit", "30");
    const [sess, perf] = await Promise.all([
      api<{ sessions: SessionItem[]; total?: number }>(`/reports/therapist-sessions${qsSessions.toString() ? `?${qsSessions}` : ""}`),
      api<{ rows: PerformanceRow[]; total?: number }>(`/reports/therapist-performance${qsPerf.toString() ? `?${qsPerf}` : ""}`),
    ]);
    setSessions(sess.sessions);
    setRows(perf.rows);
    setSessionsTotal(Number(sess.total) || 0);
    setRowsTotal(Number(perf.total) || 0);
  }, [from, therapistId, to, page, sessionsPage]);

  useEffect(() => {
    if (!user) return;
    api<{ users: TherapistUser[] }>("/users")
      .then((d) => {
        const list = d.users.filter((u) => u.role === "executor" && u.executorKind === "therapist");
        setTherapists(list);
      })
      .catch(() => setTherapists([]));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setPage(1);
    setSessionsPage(1);
    load().catch(() => {
      setSessions([]);
      setRows([]);
      setSessionsTotal(0);
      setRowsTotal(0);
    });
  }, [user, load, therapistId, from, to]);

  const totals = useMemo(
    () => ({
      sessions: rows.reduce((a, b) => a + (b.sessions || 0), 0),
      patients: rows.reduce((a, b) => a + (b.patientsCovered || 0), 0),
    }),
    [rows]
  );

  const sessionGroups = useMemo(() => {
    const m = new Map<string, { therapist: TherapistUser; items: SessionItem[] }>();
    for (const s of sessions) {
      const th = s.therapistId;
      const id = th?._id || "__none__";
      if (!m.has(id)) {
        m.set(id, { therapist: th || { _id: id, name: "—", email: "", role: "executor", executorKind: "therapist" }, items: [] });
      }
      m.get(id)!.items.push(s);
    }
    Array.from(m.values()).forEach((g) => {
      g.items.sort((a, b) => {
        const d = String(b.sessionDate).localeCompare(String(a.sessionDate));
        if (d !== 0) return d;
        return String(a.startedAt || "").localeCompare(String(b.startedAt || ""));
      });
    });
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.therapist.name.localeCompare(b.therapist.name, undefined, { sensitivity: "base" }));
  }, [sessions]);

  useEffect(() => {
    setExpandedSessionTherapists({});
  }, [sessionsPage, therapistId, from, to]);

  async function saveMarks(sessionId: string) {
    const existing = sessions.find((s) => s._id === sessionId);
    const draft = scoreDraft[sessionId];
    const resolvedScore = Number(draft?.score ?? existing?.supervisorScore ?? 0) || 0;
    const resolvedRemarks = (draft?.remarks ?? existing?.supervisorRemarks ?? "").trim();
    try {
      await api(`/reports/therapist-sessions/${sessionId}/marks`, {
        method: "PATCH",
        body: JSON.stringify({
          supervisorScore: resolvedScore,
          supervisorRemarks: resolvedRemarks,
        }),
      });
      await load();
      setMsg({ type: "ok", text: "Marks saved." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof ApiError ? e.message : "Failed to save marks." });
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-bold">Therapist Performance</h1>
        <p className="mt-2 text-sm text-zinc-500">This page is visible to upper-level roles only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <Activity className="h-3 w-3" /> Therapist tracker
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Therapist Performance</h1>
        <p className="mt-1 text-sm text-zinc-500">Center-wise therapist measurements and date-wise session tracking for upper-level roles.</p>
      </div>

      <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-zinc-500">Therapist</span>
            <Select value={therapistId} onChange={(e) => setTherapistId(e.target.value)}>
              <option value="">All therapists</option>
              {therapists.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} ({formatRoleLine(t.role, t.executorKind)})
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
              {totals.sessions} sessions, {totals.patients} patients covered
            </div>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl sm:p-5">
        <h2 className="text-lg font-bold">Therapist Measurements</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Showing {rows.length} of {rowsTotal} therapist records.
        </p>
        <div className="mt-3 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Therapist</th>
                <th className="px-2 py-2">Sessions</th>
                <th className="px-2 py-2">Patients</th>
                <th className="px-2 py-2">Attendance days</th>
                <th className="px-2 py-2">15d Plan</th>
                <th className="px-2 py-2">15d Activity</th>
                <th className="px-2 py-2">Monthly Tests</th>
                <th className="px-2 py-2">Avg Marks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-2">
                    <div className="font-semibold">{r.therapist.name}</div>
                    <div className="text-xs text-zinc-500">{r.therapist.email}</div>
                  </td>
                  <td className="px-2 py-2">{r.sessions}</td>
                  <td className="px-2 py-2">{r.patientsCovered}</td>
                  <td className="px-2 py-2">{r.attendanceDays}</td>
                  <td className="px-2 py-2">{r.planUpdates15d}</td>
                  <td className="px-2 py-2">{r.newActivities15d}</td>
                  <td className="px-2 py-2">{r.monthlyTests}</td>
                  <td className="px-2 py-2">{r.avgSupervisorScore || 0}/5</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="px-2 py-8 text-center text-zinc-500">
                    No therapist records for this filter.
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
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={page * 25 >= rowsTotal}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl sm:p-5">
        <h2 className="text-lg font-bold">Session Info (Date-wise)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          {sessionGroups.length} therapist{sessionGroups.length === 1 ? "" : "s"} on this page — {sessions.length} of {sessionsTotal} total session
          {sessionsTotal === 1 ? "" : "s"}. Open a row to see patient and time for each session.
        </p>
        <div className="mt-3 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[min(100%,360px)] text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Therapist</th>
                <th className="px-2 py-2 text-right">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {sessionGroups.map((g) => {
                const open = Boolean(expandedSessionTherapists[g.id]);
                return (
                  <Fragment key={g.id}>
                    <tr
                      tabIndex={0}
                      aria-expanded={open}
                      aria-label={`${g.therapist.name} — ${g.items.length} session(s), ${open ? "expanded" : "collapsed"}`}
                      className="cursor-pointer border-t border-zinc-100 select-none outline-none hover:bg-zinc-50/90 focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
                      onClick={() => setExpandedSessionTherapists((p) => ({ ...p, [g.id]: !p[g.id] }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedSessionTherapists((p) => ({ ...p, [g.id]: !p[g.id] }));
                        }
                      }}
                    >
                      <td className="px-2 py-2 align-top">
                        <div className="flex items-start gap-2">
                          {open ? (
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                          ) : (
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                          )}
                          <div>
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">{g.therapist.name}</div>
                            <div className="text-xs text-zinc-500">{g.therapist.email || "—"}</div>
                            <div className="mt-0.5 text-xs text-zinc-400 sm:hidden">
                              {open ? "Tap to hide details" : "Tap for session list"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums align-top text-zinc-800 dark:text-zinc-200">{g.items.length}</td>
                    </tr>
                    {open && (
                      <tr className="border-t border-zinc-100 dark:border-zinc-800">
                        <td colSpan={2} className="px-0 pb-3 pt-0">
                          <div className="ml-1 border-l-2 border-brand-200/80 pl-3 dark:border-brand-800/50 sm:ml-6 sm:pl-4">
                            <div className="max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                              <table className="w-full min-w-[640px] text-sm">
                                <thead className="text-left text-xs uppercase text-zinc-500">
                                  <tr>
                                    <th className="px-2 py-1.5">Date</th>
                                    <th className="px-2 py-1.5">Patient</th>
                                    <th className="px-2 py-1.5">Start</th>
                                    <th className="px-2 py-1.5">Duration</th>
                                    <th className="px-2 py-1.5">Video</th>
                                    <th className="px-2 py-1.5">Marks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.items.map((s) => (
                                    <tr
                                      key={s._id}
                                      className="border-t border-zinc-100 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/40"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <td className="px-2 py-1.5">{s.sessionDate}</td>
                                      <td className="px-2 py-1.5">{s.patientName}</td>
                                      <td className="px-2 py-1.5">{s.startedAt || "—"}</td>
                                      <td className="px-2 py-1.5">{s.durationMinutes || 0} min</td>
                                      <td className="px-2 py-1.5">
                                        {s.videoUrl ? (
                                          <a
                                            href={assetUrl(s.videoUrl)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-brand-600 hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            View
                                          </a>
                                        ) : (
                                          "No"
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5">{s.supervisorScore || 0}/5</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!sessions.length && (
                <tr>
                  <td colSpan={2} className="px-2 py-8 text-center text-zinc-500">
                    No sessions found for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={sessionsPage <= 1}
            onClick={() => setSessionsPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-center text-xs text-zinc-500 sm:px-2">Page {sessionsPage}</span>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={sessionsPage * 30 >= sessionsTotal}
            onClick={() => setSessionsPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {canMark && (
        <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl sm:p-5">
          <h2 className="text-lg font-bold">Give Supervisor Marks</h2>
          <div className="mt-3 space-y-3">
            {sessions.slice(0, 30).map((s) => (
              <div key={s._id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{s.therapistId?.name} - {s.patientName}</div>
                    <div className="text-xs text-zinc-500">
                      {s.sessionDate} · {s.startedAt || "--"} to {s.endedAt || "--"} · {s.durationMinutes || 0} min
                    </div>
                    {s.videoUrl && (
                      <a href={assetUrl(s.videoUrl)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand-600 hover:underline">
                        Open uploaded video
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">Current marks: {s.supervisorScore || 0}/5</div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr] lg:grid-cols-[120px_1fr_auto]">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-zinc-500">Score /5</span>
                    <Input
                      type="number"
                      min={0}
                      max={5}
                      step="0.5"
                      value={scoreDraft[s._id]?.score ?? String(s.supervisorScore ?? 0)}
                      onChange={(e) =>
                        setScoreDraft((p) => ({ ...p, [s._id]: { score: e.target.value, remarks: p[s._id]?.remarks ?? s.supervisorRemarks ?? "" } }))
                      }
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-zinc-500">Remarks</span>
                    <Textarea
                      value={scoreDraft[s._id]?.remarks ?? s.supervisorRemarks ?? ""}
                      onChange={(e) =>
                        setScoreDraft((p) => ({ ...p, [s._id]: { score: p[s._id]?.score ?? String(s.supervisorScore ?? 0), remarks: e.target.value } }))
                      }
                      rows={2}
                    />
                  </label>
                  <div className="flex items-end sm:col-span-2 lg:col-span-1">
                    <Button type="button" onClick={() => void saveMarks(s._id)} className="w-full gap-2 sm:w-auto">
                      <Star className="h-4 w-4" /> Save marks
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
