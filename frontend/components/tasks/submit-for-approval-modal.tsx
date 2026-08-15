"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api, ApiError } from "@/lib/api";
import { useCelebration } from "@/contexts/celebration-context";
import { useEffect, useState } from "react";

export function SubmitForApprovalModal({
  open,
  taskId,
  taskIds,
  taskTitle,
  onBehalfAssigneeId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  taskId?: string | null;
  taskIds?: string[];
  taskTitle?: string;
  onBehalfAssigneeId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { celebrate } = useCelebration();
  const [remarks, setRemarks] = useState("");
  const [err, setErr] = useState("");
  const [working, setWorking] = useState(false);
  const bulk = Boolean(taskIds?.length);
  const count = bulk ? taskIds!.length : 1;

  useEffect(() => {
    if (!open) return;
    setRemarks("");
    setErr("");
    setWorking(false);
  }, [open, taskId, taskIds]);

  const submit = async () => {
    const text = remarks.trim();
    if (!text) {
      setErr("Please add remarks before submitting for approval.");
      return;
    }
    setErr("");
    setWorking(true);
    try {
      const onBehalf = onBehalfAssigneeId ? { onBehalfAssigneeId } : {};
      if (bulk && taskIds?.length) {
        await api("/tasks/bulk", {
          method: "POST",
          body: JSON.stringify({ ids: taskIds, status: "completed", submissionRemarks: text, ...onBehalf }),
        });
      } else if (taskId) {
        await api(`/tasks/${taskId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "completed", submissionRemarks: text, ...onBehalf }),
        });
      }
      onClose();
      onSuccess?.();
      window.requestAnimationFrame(() => celebrate("submit"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not submit for approval.");
    } finally {
      setWorking(false);
    }
  };

  const title =
    bulk && count > 1
      ? `Submit ${count} tasks for approval`
      : `Submit for approval${taskTitle ? `: ${taskTitle}` : ""}`;

  return (
    <Modal open={open} title={title} onClose={() => !working && onClose()} className="max-w-lg">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Add remarks for the person who assigned {bulk && count > 1 ? "these tasks" : "this task"}. They will see this in
        For Approval.
      </p>
      <label className="mt-4 block">
        <span className="text-xs font-semibold text-zinc-500">Remarks</span>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={4}
          placeholder="What was completed, notes for reviewer…"
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      {err ? <p className="mt-2 text-xs font-semibold text-rose-600">{err}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={working}>
          Cancel
        </Button>
        <Button variant="gradient" onClick={() => void submit()} disabled={working}>
          {working ? "Submitting…" : "Submit for approval"}
        </Button>
      </div>
    </Modal>
  );
}
