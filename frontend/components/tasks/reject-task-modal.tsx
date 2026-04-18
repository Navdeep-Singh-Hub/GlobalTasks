"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { UserRound, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

export type RejectMode = "no_action" | "reassign";

export function RejectTaskModal({
  open,
  taskId,
  taskTitle,
  onClose,
  onSuccess,
}: {
  open: boolean;
  taskId: string | null;
  taskTitle: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [mode, setMode] = useState<RejectMode>("reassign");
  const [remarks, setRemarks] = useState("");
  const [err, setErr] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("reassign");
    setRemarks("");
    setErr("");
    setWorking(false);
  }, [open, taskId]);

  const submit = async (submitMode: RejectMode) => {
    if (!taskId) return;
    const text = remarks.trim();
    if (!text) {
      setErr("Please provide a reason for rejection.");
      return;
    }
    setErr("");
    setWorking(true);
    try {
      await api(`/tasks/${taskId}/reject`, {
        method: "POST",
        body: JSON.stringify({ mode: submitMode, remarks: text }),
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Reject failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Reject Task: ${taskTitle || "Task"}`}
      onClose={() => !working && onClose()}
      className="max-w-xl"
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Choose how this rejection should be handled. Remarks are required in both cases.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={working}
          onClick={() => setMode("no_action")}
          className={cn(
            "rounded-2xl border-2 p-4 text-left transition",
            mode === "no_action"
              ? "border-rose-400 bg-rose-50/90 dark:border-rose-700 dark:bg-rose-950/40"
              : "border-zinc-200 bg-white hover:border-rose-200 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-rose-900/50"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
            <XCircle className="h-5 w-5" />
          </div>
          <div className="mt-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">No action required</div>
          <p className="mt-1 text-[12px] leading-snug text-zinc-600 dark:text-zinc-400">
            Rejects this task permanently and closes it. No further action will be taken.
          </p>
        </button>

        <button
          type="button"
          disabled={working}
          onClick={() => setMode("reassign")}
          className={cn(
            "rounded-2xl border-2 p-4 text-left transition",
            mode === "reassign"
              ? "border-amber-400 bg-amber-50/90 dark:border-amber-600 dark:bg-amber-950/35"
              : "border-zinc-200 bg-white hover:border-amber-200 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-amber-900/40"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="mt-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">Reassign task</div>
          <p className="mt-1 text-[12px] leading-snug text-zinc-600 dark:text-zinc-400">
            Rejects this completion and returns the task to pending so assignees can correct work and resubmit.
          </p>
        </button>
      </div>

      <div className="mt-5">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Remarks (required)</label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          disabled={working}
          rows={4}
          placeholder="Please provide a reason for rejection…"
          className="mt-1.5 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-brand-500/30 placeholder:text-zinc-400 focus:border-brand-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        {err && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{err}</p>}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
        <Button type="button" variant="outline" onClick={() => onClose()} disabled={working}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          className="gap-2 border-rose-600 bg-rose-600 hover:bg-rose-700"
          disabled={working}
          onClick={() => void submit("no_action")}
        >
          <XCircle className="h-4 w-4" /> No action required
        </Button>
        <Button
          type="button"
          className="gap-2 border-amber-500 bg-amber-500 text-white hover:bg-amber-600"
          disabled={working}
          onClick={() => void submit("reassign")}
        >
          <UserRound className="h-4 w-4" /> Reassign task
        </Button>
      </div>
    </Modal>
  );
}
