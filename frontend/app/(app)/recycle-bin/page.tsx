"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ApiError, api } from "@/lib/api";
import { formatAppDateTime } from "@/lib/date-format";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type Task = { _id: string; title: string; deletedAt?: string | null };

export default function RecycleBinPage() {
  const [items, setItems] = useState<Task[]>([]);
  const [retentionDays, setRetentionDays] = useState(10);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = () =>
    api<{ tasks: Task[] }>("/tasks?trash=only&limit=200").then((d) => setItems(d.tasks));

  useEffect(() => {
    load();
    api<{ recycleBinRetentionDays?: number }>("/health")
      .then((h) => {
        if (typeof h.recycleBinRetentionDays === "number") setRetentionDays(h.recycleBinRetentionDays);
      })
      .catch(() => {});
  }, []);

  const handleRestore = async (t: Task) => {
    setErr("");
    setBusyId(t._id);
    try {
      await api(`/tasks/${t._id}/restore`, { method: "POST" });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not restore task.");
    } finally {
      setBusyId(null);
    }
  };

  const handleHardDelete = async (t: Task) => {
    const ok = window.confirm(`Permanently delete "${t.title}"? This cannot be undone.`);
    if (!ok) return;
    setErr("");
    setBusyId(t._id);
    try {
      await api(`/tasks/${t._id}/hard`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not delete permanently.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        chip="Trash"
        title="Recycle bin"
        subtitle={`Restore accidentally deleted tasks or permanently remove them. Items in the bin for more than ${retentionDays} days are removed automatically.`}
        icon={Trash2}
      />
      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {err}
        </div>
      ) : null}
      <div className="glass-card p-3">
        {items.length === 0 ? (
          <EmptyState variant="success" title="Bin is empty" description="Deleted tasks will appear here for recovery." />
        ) : (
          items.map((t) => (
            <div
              key={t._id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-100/80 p-3 text-sm transition hover:bg-zinc-50/50 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:hover:bg-zinc-900/40"
            >
              <div className="min-w-0">
                <div className="font-semibold">{t.title}</div>
                <div className="text-xs text-zinc-500">Deleted {t.deletedAt ? formatAppDateTime(t.deletedAt) : ""}</div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={busyId === t._id}
                  onClick={() => handleRestore(t)}
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="w-full sm:w-auto"
                  disabled={busyId === t._id}
                  onClick={() => handleHardDelete(t)}
                >
                  Delete forever
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
