"use client";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge, cadenceTone, priorityTone } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { Shuffle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Task = { _id: string; title: string; taskType: string; priority: string; assignees?: { _id: string; name: string }[] };
type User = { _id: string; name: string };

export default function TaskShiftPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<string>("");

  const load = useCallback(() => {
    api<{ tasks: Task[] }>("/tasks?limit=100&status=pending").then((d) => setTasks(d.tasks));
  }, []);

  useEffect(() => {
    load();
    api<{ users: User[] }>("/users").then((d) => setUsers(d.users)).catch(() => setUsers([]));
  }, [load]);

  const shift = async () => {
    if (!target || !selected.length) return;
    for (const id of selected) {
      await api(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ assignees: [target] }) });
    }
    setSelected([]);
    setTarget("");
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <Shuffle className="h-3 w-3" /> Reassign
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Task Shift</h1>
        <p className="mt-1 text-sm text-zinc-500">Bulk-reassign pending tasks from one team member to another.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:flex-wrap sm:items-center sm:rounded-2xl">
        <div className="w-full min-w-0 sm:min-w-[220px] sm:max-w-xs sm:flex-1">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Shift to user…</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </Select>
        </div>
        <Button variant="gradient" className="w-full sm:w-auto" onClick={shift} disabled={!selected.length || !target}>
          Shift {selected.length} task{selected.length === 1 ? "" : "s"}
        </Button>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl">
        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.08em] text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="w-10 p-3"></th>
              <th className="p-3 text-left">Task</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">Priority</th>
              <th className="p-3 text-left">Assigned To</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t._id} className="border-t border-zinc-100 hover:bg-brand-50/40 dark:border-zinc-800">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(t._id)}
                    onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, t._id] : prev.filter((x) => x !== t._id))}
                    className="h-4 w-4 rounded border-zinc-300 text-brand-500"
                  />
                </td>
                <td className="p-3 font-semibold">{t.title}</td>
                <td className="p-3"><Badge tone={cadenceTone(t.taskType)}>{t.taskType.replace("_", " ")}</Badge></td>
                <td className="p-3"><Badge tone={priorityTone(t.priority)}>{t.priority}</Badge></td>
                <td className="p-3">{t.assignees?.map((a) => a.name).join(", ") || "Unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
