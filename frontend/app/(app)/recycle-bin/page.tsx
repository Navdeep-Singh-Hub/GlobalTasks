"use client";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type Task = { _id: string; title: string; deletedAt?: string | null };

export default function RecycleBinPage() {
  const [items, setItems] = useState<Task[]>([]);
  const [retentionDays, setRetentionDays] = useState(10);
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

  return (
    <div className="space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <Trash2 className="h-3 w-3" /> Trash
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Recycle bin</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Restore accidentally deleted tasks or permanently remove them. Items in the bin for more than{" "}
          <strong className="text-zinc-700 dark:text-zinc-300">{retentionDays} days</strong> are removed automatically by the server.
        </p>
      </div>
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        {items.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">Bin is empty.</div>
        ) : (
          items.map((t) => (
            <div key={t._id} className="flex items-center justify-between rounded-xl border border-zinc-100 p-3 text-sm dark:border-zinc-800">
              <div>
                <div className="font-semibold">{t.title}</div>
                <div className="text-xs text-zinc-500">Deleted {t.deletedAt ? new Date(t.deletedAt).toLocaleString() : ""}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={async () => { await api(`/tasks/${t._id}/restore`, { method: "POST" }); load(); }}>Restore</Button>
                <Button size="sm" variant="danger" onClick={async () => { await api(`/tasks/${t._id}/hard`, { method: "DELETE" }); load(); }}>Delete forever</Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
