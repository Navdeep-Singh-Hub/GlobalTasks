"use client";

import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, api, assetUrl } from "@/lib/api";
import { formatRoleLine, isManagement } from "@/lib/roles";
import { Activity, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  targetAssigned?: number;
  targetAchieved?: number;
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
  targetAssigned: number;
  targetAchieved: number;
  targetCompletionPercent: number;
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
      achieved: rows.reduce((a, b) => a + (b.targetAchieved || 0), 0),
      assigned: rows.reduce((a, b) => a + (b.targetAssigned || 0), 0),
    }),
    [rows]
  );

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
    <div className="space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <Activity className="h-3 w-3" /> Therapist tracker
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Therapist Performance</h1>
        <p className="mt-1 text-sm text-zinc-500">Center-wise therapist measurements and date-wise session tracking for upper-level roles.</p>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid gap-3 md:grid-cols-4">
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
              {totals.sessions} sessions, {totals.achieved}/{totals.assigned} targets achieved
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

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-bold">Therapist Measurements</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Showing {rows.length} of {rowsTotal} therapist records.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Therapist</th>
                <th className="px-2 py-2">Sessions</th>
                <th className="px-2 py-2">Patients</th>
                <th className="px-2 py-2">Attendance days</th>
                <th className="px-2 py-2">Targets %</th>
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
                  <td className="px-2 py-2">{r.targetCompletionPercent}%</td>
                  <td className="px-2 py-2">{r.planUpdates15d}</td>
                  <td className="px-2 py-2">{r.newActivities15d}</td>
                  <td className="px-2 py-2">{r.monthlyTests}</td>
                  <td className="px-2 py-2">{r.avgSupervisorScore || 0}/5</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="px-2 py-8 text-center text-zinc-500">
                    No therapist records for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span className="text-xs text-zinc-500">Page {page}</span>
          <Button type="button" variant="outline" disabled={page * 25 >= rowsTotal} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-bold">Session Info (Date-wise)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Showing {sessions.length} of {sessionsTotal} session entries.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Therapist</th>
                <th className="px-2 py-2">Patient</th>
                <th className="px-2 py-2">Start</th>
                <th className="px-2 py-2">Duration</th>
                <th className="px-2 py-2">Targets</th>
                <th className="px-2 py-2">Video</th>
                <th className="px-2 py-2">Marks</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s._id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-2">{s.sessionDate}</td>
                  <td className="px-2 py-2">{s.therapistId?.name || "—"}</td>
                  <td className="px-2 py-2">{s.patientName}</td>
                  <td className="px-2 py-2">{s.startedAt || "—"}</td>
                  <td className="px-2 py-2">{s.durationMinutes || 0} min</td>
                  <td className="px-2 py-2">
                    {(s.targetAchieved || 0)}/{s.targetAssigned || 0}
                  </td>
                  <td className="px-2 py-2">
                    {s.videoUrl ? (
                      <a href={assetUrl(s.videoUrl)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                        View
                      </a>
                    ) : (
                      "No"
                    )}
                  </td>
                  <td className="px-2 py-2">{s.supervisorScore || 0}/5</td>
                </tr>
              ))}
              {!sessions.length && (
                <tr>
                  <td colSpan={8} className="px-2 py-8 text-center text-zinc-500">
                    No sessions found for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={sessionsPage <= 1} onClick={() => setSessionsPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span className="text-xs text-zinc-500">Page {sessionsPage}</span>
          <Button
            type="button"
            variant="outline"
            disabled={sessionsPage * 30 >= sessionsTotal}
            onClick={() => setSessionsPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {canMark && (
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
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
                <div className="mt-3 grid gap-2 md:grid-cols-[120px_1fr_auto]">
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
                  <div className="flex items-end">
                    <Button type="button" onClick={() => void saveMarks(s._id)} className="gap-2">
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
