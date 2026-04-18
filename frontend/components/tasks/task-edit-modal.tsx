"use client";

import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api, ApiError } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type TaskPayload = {
  _id: string;
  title: string;
  description?: string;
  taskType: string;
  status: string;
  priority: string;
  dueDate: string;
  recurrence?: { forever?: boolean; includeSunday?: boolean; weekOff?: string; endDate?: string | null };
  requiresApproval?: boolean;
  assignees?: { _id: string; name: string }[];
  project?: { _id: string; name?: string } | string | null;
};

type UserOpt = { _id: string; name: string };
type ProjectOpt = { _id: string; name: string };

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

export function TaskEditModal({
  taskId,
  open,
  onClose,
  onSaved,
}: {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [meta, setMeta] = useState<{ types: string[]; statuses: string[]; priorities: string[] } | null>(null);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("one_time");
  const [status, setStatus] = useState("pending");
  const [priority, setPriority] = useState("normal");
  const [dueLocal, setDueLocal] = useState("");
  const [forever, setForever] = useState(true);
  const [includeSunday, setIncludeSunday] = useState(false);
  const [weekOff, setWeekOff] = useState("Sunday");
  const [endDate, setEndDate] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");

  const load = useCallback(async () => {
    if (!taskId || !open) return;
    setLoading(true);
    setErr("");
    try {
      const [taskRes, usersRes, projectsRes, metaRes] = await Promise.all([
        api<{ task: TaskPayload }>(`/tasks/${taskId}`),
        api<{ users: UserOpt[] }>("/users").catch(() => ({ users: [] as UserOpt[] })),
        api<{ projects: ProjectOpt[] }>("/projects").catch(() => ({ projects: [] as ProjectOpt[] })),
        api<{ types: string[]; statuses: string[]; priorities: string[] }>("/tasks/meta"),
      ]);
      const t = taskRes.task;
      setMeta(metaRes);
      setUsers(usersRes.users || []);
      setProjects(projectsRes.projects || []);
      setTitle(t.title || "");
      setDescription(t.description || "");
      setTaskType(t.taskType || "one_time");
      setStatus(t.status || "pending");
      setPriority(t.priority || "normal");
      setDueLocal(toLocalDatetimeValue(t.dueDate));
      setForever(t.recurrence?.forever !== false);
      setIncludeSunday(!!t.recurrence?.includeSunday);
      setWeekOff(t.recurrence?.weekOff || "Sunday");
      setEndDate(t.recurrence?.endDate ? new Date(t.recurrence.endDate).toISOString().slice(0, 10) : "");
      setRequiresApproval(!!t.requiresApproval);
      setAssigneeIds((t.assignees || []).map((a) => a._id));
      const pid = t.project && typeof t.project === "object" && "_id" in t.project ? String(t.project._id) : "";
      setProjectId(pid);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load task");
    } finally {
      setLoading(false);
    }
  }, [taskId, open]);

  useEffect(() => {
    if (open && taskId) void load();
  }, [open, taskId, load]);

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    if (!taskId || !title.trim() || !dueLocal) {
      setErr("Title and due date are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description,
        taskType,
        status,
        priority,
        dueDate: new Date(dueLocal).toISOString(),
        assignees: assigneeIds,
        project: projectId || null,
        requiresApproval,
      };
      if (taskType !== "one_time") {
        body.recurrence = {
          forever,
          includeSunday,
          weekOff,
          endDate: forever || !endDate ? null : new Date(endDate).toISOString(),
        };
      }
      await api(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(body) });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !taskId) return null;

  const types = meta?.types || ["one_time", "daily", "weekly", "fortnightly", "monthly", "quarterly", "yearly"];
  const statuses = meta?.statuses || ["pending", "in_progress", "awaiting_approval", "completed", "overdue"];
  const priorities = meta?.priorities || ["low", "normal", "high", "urgent"];

  return (
    <Modal open={open} title="Edit task" onClose={onClose} className="max-w-2xl max-h-[90vh] overflow-y-auto">
      {loading ? (
        <div className="py-10 text-center text-sm text-zinc-500">Loading…</div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="md:col-span-2" />
            <Textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="md:col-span-2 min-h-[80px]" />
            <Select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
              {types.map((tp) => (
                <option key={tp} value={tp}>
                  {tp.replace("_", " ")}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Input type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="md:col-span-2">
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          {taskType !== "one_time" && (
            <div className="mt-4 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={forever} onChange={(e) => setForever(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
                Repeat forever
              </label>
              {!forever && (
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="End date" />
              )}
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={includeSunday} onChange={(e) => setIncludeSunday(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
                Include Sunday
              </label>
              <div className="text-[11px] font-bold uppercase text-zinc-500">Week off</div>
              <Select value={weekOff} onChange={(e) => setWeekOff(e.target.value)}>
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <label className="mt-4 flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
            Requires admin approval to complete
          </label>

          <div className="mt-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Assignees</div>
            <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
              {users.length === 0 ? (
                <div className="text-xs text-zinc-400">No users loaded</div>
              ) : (
                users.map((u) => (
                  <label key={u._id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(u._id)}
                      onChange={() => toggleAssignee(u._id)}
                      className="h-3.5 w-3.5 rounded border-zinc-300"
                    />
                    {u.name}
                  </label>
                ))
              )}
            </div>
          </div>

          {err && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">{err}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
