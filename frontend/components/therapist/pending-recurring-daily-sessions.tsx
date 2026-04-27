"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

type SessionRow = {
  id: string;
  patientName: string;
  durationMinutes: string;
  startedAt: string;
  videoUploaded: boolean;
};

type UploadedSession = {
  _id: string;
  sessionDate: string;
  patientName: string;
  startedAt?: string;
  durationMinutes?: number;
  videoUploaded?: boolean;
  therapistId?: { _id: string; name: string } | null;
};

function newRow(): SessionRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    patientName: "",
    durationMinutes: "30",
    startedAt: "",
    videoUploaded: false,
  };
}

export function PendingRecurringDailySessions() {
  const { user } = useAuth();
  const isSupervisor = user?.role === "supervisor";
  const [sessionDate, setSessionDate] = useState(todayIsoDate);
  const [rows, setRows] = useState<SessionRow[]>(() => [newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [uploadedSessions, setUploadedSessions] = useState<UploadedSession[]>([]);
  const [loadingUploaded, setLoadingUploaded] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [viewDate, setViewDate] = useState(todayIsoDate);

  useEffect(() => {
    if (!user) return;
    const qs = new URLSearchParams();
    qs.set("limit", "100");
    qs.set("from", viewDate);
    qs.set("to", viewDate);
    if (isSupervisor) qs.set("scope", "self");
    setLoadingUploaded(true);
    api<{ sessions: UploadedSession[] }>(`/reports/therapist-sessions?${qs.toString()}`)
      .then((d) => setUploadedSessions(Array.isArray(d.sessions) ? d.sessions : []))
      .catch(() => setUploadedSessions([]))
      .finally(() => setLoadingUploaded(false));
  }, [user, isSupervisor, viewDate, refreshToken]);

  const addRow = useCallback(() => setRows((r) => [...r, newRow()]), []);
  const removeRow = useCallback((id: string) => {
    setRows((r) => (r.length <= 1 ? r : r.filter((x) => x.id !== id)));
  }, []);
  const patchRow = useCallback((id: string, patch: Partial<SessionRow>) => {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const submit = async () => {
    const filled = rows.filter((r) => r.patientName.trim());
    if (!filled.length) {
      setMessage({ type: "err", text: "Add at least one session with a patient name." });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      for (const r of filled) {
        // eslint-disable-next-line no-await-in-loop
        await api("/reports/therapist-sessions", {
          method: "POST",
          body: JSON.stringify({
            sessionDate,
            patientName: r.patientName.trim(),
            startedAt: r.startedAt,
            durationMinutes: Number(r.durationMinutes) || 0,
            videoUploaded: r.videoUploaded,
            videoUrl: "",
          }),
        });
      }
      setRows([newRow()]);
      setSessionDate(todayIsoDate());
      setMessage({ type: "ok", text: `Saved ${filled.length} session(s).` });
      setRefreshToken((v) => v + 1);
    } catch (e) {
      setMessage({ type: "err", text: e instanceof ApiError ? e.message : "Could not save sessions." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-xl border-2 border-brand-200/80 bg-gradient-to-br from-brand-50/90 to-white p-4 shadow-card dark:border-brand-900/50 dark:from-brand-950/40 dark:to-zinc-950 sm:rounded-2xl sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-100 pb-4 dark:border-brand-900/40">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Daily · Therapists</div>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Patient session log</h2>
          <p className="mt-1 max-w-2xl text-xs text-zinc-600 dark:text-zinc-400">
            Log every session for the selected date. This block is separate from your assigned recurring tasks below. Use + to add more
            rows, then save all at once.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <label className="space-y-1 sm:w-auto">
            <span className="text-xs font-semibold text-zinc-500">Date</span>
            <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="w-full sm:w-[160px]" />
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs font-medium text-zinc-500">More sessions</span>
        <button
          type="button"
          onClick={() => addRow()}
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-brand-400 bg-white text-brand-700 shadow-sm hover:bg-brand-50 dark:border-brand-600 dark:bg-zinc-900 dark:text-brand-300 dark:hover:bg-brand-950/50"
          aria-label="Add another session row"
          title="Add session"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div className="hidden gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 md:grid md:grid-cols-[minmax(0,1.2fr)_100px_120px_140px_40px] md:px-1">
          <span>Patient</span>
          <span>Duration (min)</span>
          <span>Start time</span>
          <span>Video uploaded</span>
          <span />
        </div>

        {rows.map((r) => (
          <div
            key={r.id}
            className="grid gap-2 rounded-xl border border-zinc-200 bg-white/90 p-3 dark:border-zinc-700 dark:bg-zinc-900/80 md:grid-cols-[minmax(0,1.2fr)_100px_120px_140px_40px] md:items-end"
          >
            <label className="space-y-1 md:col-span-1">
              <span className="text-xs font-semibold text-zinc-500 md:hidden">Patient name</span>
              <Input placeholder="Patient name" value={r.patientName} onChange={(e) => patchRow(r.id, { patientName: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-zinc-500 md:hidden">Duration (min)</span>
              <Input
                type="number"
                min={0}
                value={r.durationMinutes}
                onChange={(e) => patchRow(r.id, { durationMinutes: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-zinc-500 md:hidden">Start time</span>
              <Input type="time" value={r.startedAt} onChange={(e) => patchRow(r.id, { startedAt: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium dark:border-zinc-700">
              <input
                type="checkbox"
                checked={r.videoUploaded}
                onChange={(e) => patchRow(r.id, { videoUploaded: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-300 text-brand-600"
              />
              Video uploaded
            </label>
            <div className="flex items-end justify-end">
              <button
                type="button"
                onClick={() => removeRow(r.id)}
                disabled={rows.length <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:border-rose-200 hover:text-rose-600 disabled:opacity-40 dark:border-zinc-700"
                aria-label="Remove row"
                title="Remove row"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {message && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-brand-100 pt-4 dark:border-brand-900/40 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-zinc-500">
          {isSupervisor
            ? "Saving your own supervisor sessions."
            : "Saved sessions appear on Therapist Performance for supervisors."}
        </p>
        <Button type="button" onClick={() => void submit()} disabled={submitting} className="w-full gap-2 sm:w-auto">
          {submitting ? "Saving…" : "Save all sessions"}
        </Button>
      </div>

      <div className="mt-5 rounded-xl border border-zinc-200/80 bg-white p-3 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Recent uploaded sessions</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span>Date</span>
              <Input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} className="h-8 min-w-[148px] px-2.5 text-xs" />
            </label>
          </div>
        </div>
        {loadingUploaded ? (
          <p className="mt-3 text-xs text-zinc-500">Loading sessions...</p>
        ) : uploadedSessions.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-left text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Patient</th>
                  <th className="px-2 py-1.5">Start</th>
                  <th className="px-2 py-1.5">Duration</th>
                  <th className="px-2 py-1.5">Video</th>
                </tr>
              </thead>
              <tbody>
                {uploadedSessions.map((s) => (
                  <tr key={s._id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-1.5">{s.sessionDate}</td>
                    <td className="px-2 py-1.5">{s.patientName}</td>
                    <td className="px-2 py-1.5">{s.startedAt || "—"}</td>
                    <td className="px-2 py-1.5">{s.durationMinutes || 0} min</td>
                    <td className="px-2 py-1.5">{s.videoUploaded ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">No uploaded sessions found for {viewDate}.</p>
        )}
      </div>
    </section>
  );
}
