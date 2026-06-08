"use client";

import { MotionButton } from "@/components/ui/motion-button";
import { Select } from "@/components/ui/input";
import { Badge, cadenceTone, priorityTone } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SurfacePanel } from "@/components/ui/surface-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/contexts/auth-context";
import { isCeo, isManagement } from "@/lib/roles";
import { api } from "@/lib/api";
import { Shuffle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Task = { _id: string; title: string; taskType: string; priority: string; assignees?: { _id: string; name: string }[] };
type User = { _id: string; name: string };

export default function TaskShiftPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    api<{ tasks: Task[] }>("/tasks?limit=100&status=pending").then((d) => setTasks(d.tasks));
  }, []);

  useEffect(() => {
    load();
    const canPickAssignees = user?.role && (isManagement(user.role) || isCeo(user.role));
    const qs = canPickAssignees ? "?assignable=true&status=active" : "";
    api<{ users: User[] }>(`/users${qs}`).then((d) => setUsers(d.users)).catch(() => setUsers([]));
  }, [load, user?.role]);

  const shift = async () => {
    if (!target || !selected.length) return;
    setLoading(true);
    try {
      for (const id of selected) {
        await api(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ assignees: [target] }) });
      }
      setSelected([]);
      setTarget("");
      load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        chip="Reassign"
        icon={Shuffle}
        title="Task Shift"
        subtitle="Bulk-reassign pending tasks from one team member to another."
      />

      <SurfacePanel variant="elevated">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="w-full min-w-0 sm:min-w-[220px] sm:max-w-xs sm:flex-1">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Shift to user…</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <MotionButton variant="gradient" className="w-full sm:w-auto" onClick={shift} loading={loading} disabled={!selected.length || !target}>
            Shift {selected.length} task{selected.length === 1 ? "" : "s"}
          </MotionButton>
        </div>
      </SurfacePanel>

      <SurfacePanel noPadding variant="gradient-border" className="overflow-hidden">
        {tasks.length === 0 ? (
          <EmptyState title="No pending tasks" description="There are no pending tasks available to shift." variant="success" />
        ) : (
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
                  <tr key={t._id} className="border-t border-zinc-100 transition-colors hover:bg-brand-50/40 dark:border-zinc-800">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(t._id)}
                        onChange={(e) =>
                          setSelected((prev) => (e.target.checked ? [...prev, t._id] : prev.filter((x) => x !== t._id)))
                        }
                        className="h-4 w-4 rounded border-zinc-300 text-brand-500 focus:ring-brand-400"
                      />
                    </td>
                    <td className="p-3 font-semibold">{t.title}</td>
                    <td className="p-3">
                      <Badge tone={cadenceTone(t.taskType)}>{t.taskType.replace("_", " ")}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                    </td>
                    <td className="p-3">{t.assignees?.map((a) => a.name).join(", ") || "Unassigned"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfacePanel>
    </div>
  );
}
