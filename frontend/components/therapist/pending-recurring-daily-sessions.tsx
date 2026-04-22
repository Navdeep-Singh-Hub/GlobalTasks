"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

type SessionRow = {
  id: string;
  patientName: string;
  durationMinutes: string;
  startedAt: string;
  targetAssigned: string;
  targetAchieved: string;
  videoUploaded: boolean;
};

function newRow(): SessionRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    patientName: "",
    durationMinutes: "30",
    startedAt: "",
    targetAssigned: "1",
    targetAchieved: "0",
    videoUploaded: false,
  };
}

export function PendingRecurringDailySessions() {
  const [sessionDate, setSessionDate] = useState(todayIsoDate);
  const [rows, setRows] = useState<SessionRow[]>(() => [newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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
    for (const r of filled) {
      const ta = Math.max(0, Number(r.targetAssigned) || 0);
      const tg = Math.max(0, Number(r.targetAchieved) || 0);
      if (ta > 0 && tg > ta) {
        setMessage({ type: "err", text: `Targets achieved cannot exceed assigned for "${r.patientName.trim()}".` });
        return;
      }
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
            targetAssigned: Number(r.targetAssigned) || 0,
            targetAchieved: Number(r.targetAchieved) || 0,
            videoUploaded: r.videoUploaded,
            videoUrl: "",
          }),
        });
      }
      setRows([newRow()]);
      setSessionDate(todayIsoDate());
      setMessage({ type: "ok", text: `Saved ${filled.length} session(s).` });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof ApiError ? e.message : "Could not save sessions." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border-2 border-brand-200/80 bg-gradient-to-br from-brand-50/90 to-white p-5 shadow-card dark:border-brand-900/50 dark:from-brand-950/40 dark:to-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-100 pb-4 dark:border-brand-900/40">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Daily · Therapists</div>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Patient session log</h2>
          <p className="mt-1 max-w-2xl text-xs text-zinc-600 dark:text-zinc-400">
            Log every session for the selected date. This block is separate from your assigned recurring tasks below. Use + to add more
            rows, then save all at once.
          </p>
        </div>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-zinc-500">Date</span>
          <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="w-[160px]" />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
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
        <div className="hidden gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 md:grid md:grid-cols-[minmax(0,1.2fr)_100px_120px_100px_100px_140px_40px] md:px-1">
          <span>Patient</span>
          <span>Duration (min)</span>
          <span>Start time</span>
          <span>Targets assigned</span>
          <span>Targets achieved</span>
          <span>Video uploaded</span>
          <span />
        </div>

        {rows.map((r) => (
          <div
            key={r.id}
            className="grid gap-2 rounded-xl border border-zinc-200 bg-white/90 p-3 dark:border-zinc-700 dark:bg-zinc-900/80 md:grid-cols-[minmax(0,1.2fr)_100px_120px_100px_100px_140px_40px] md:items-end"
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
            <label className="space-y-1">
              <span className="text-xs font-semibold text-zinc-500 md:hidden">Targets assigned</span>
              <Input
                type="number"
                min={0}
                value={r.targetAssigned}
                onChange={(e) => patchRow(r.id, { targetAssigned: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-zinc-500 md:hidden">Targets achieved</span>
              <Input
                type="number"
                min={0}
                value={r.targetAchieved}
                onChange={(e) => patchRow(r.id, { targetAchieved: e.target.value })}
              />
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-brand-100 pt-4 dark:border-brand-900/40">
        <p className="text-[11px] text-zinc-500">Saved sessions appear on Therapist Performance for supervisors.</p>
        <Button type="button" onClick={() => void submit()} disabled={submitting} className="gap-2">
          {submitting ? "Saving…" : "Save all sessions"}
        </Button>
      </div>
    </section>
  );
}
