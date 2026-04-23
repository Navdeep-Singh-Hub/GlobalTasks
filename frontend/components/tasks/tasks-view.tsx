"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, cadenceTone, priorityTone, statusTone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { isCeo } from "@/lib/roles";
import { CheckCircle2, Eye, Filter, Grid3x3, Inbox, Layers, Mic, Paperclip, Pencil, Search, Table2, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { TaskDetailDrawer } from "./task-detail-drawer";
import { TaskEditModal } from "./task-edit-modal";
import { RejectTaskModal } from "./reject-task-modal";

type Task = {
  _id: string;
  title: string;
  description?: string;
  taskType: string;
  status: string;
  priority: string;
  dueDate: string;
  recurrence?: { forever?: boolean; includeSunday?: boolean; weekOff?: string };
  requiresApproval?: boolean;
  approvalStatus?: string;
  project?: { name: string };
  assignees?: { _id: string; name: string; email: string }[];
  createdBy?: { _id: string; name: string };
  attachments?: { name: string; url?: string }[];
  voiceNoteUrl?: string;
};

type Preset = {
  recurring?: boolean;
  status?: string;
  approval?: boolean;
};

const CADENCE_LABEL: Record<string, string> = {
  one_time: "One Time",
  daily: "Daily",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export function TasksView({
  title,
  subtitle,
  preset = {},
  showCadenceFilter = true,
  masterAdminActions = false,
}: {
  title: string;
  subtitle: string;
  preset?: Preset;
  showCadenceFilter?: boolean;
  /** When true and the signed-in user is CEO, show Edit / Delete on Master Single & Master Recurring. */
  masterAdminActions?: boolean;
}) {
  const { user } = useAuth();
  const showMasterAdmin = masterAdminActions && isCeo(user?.role);
  const showApprovalQuickActions = Boolean(preset.approval && isCeo(user?.role));

  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"table" | "cards">("table");
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(preset.status || "all");
  const [priority, setPriority] = useState("all");
  const [taskType, setTaskType] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  type DeleteChoiceState = null | { mode: "single"; id: string } | { mode: "bulk"; ids: string[] };
  const [deleteChoice, setDeleteChoice] = useState<DeleteChoiceState>(null);
  const [deleteWorking, setDeleteWorking] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const [rejectFor, setRejectFor] = useState<{ id: string; title: string } | null>(null);

  const openDeleteSingle = (id: string) => {
    if (!showMasterAdmin) return;
    setDeleteErr("");
    setDeleteChoice({ mode: "single", id });
  };

  const openDeleteBulk = () => {
    if (!selected.length) return;
    setDeleteErr("");
    setDeleteChoice({ mode: "bulk", ids: [...selected] });
  };

  const runSoftDelete = async () => {
    if (!deleteChoice) return;
    setDeleteWorking(true);
    setDeleteErr("");
    try {
      if (deleteChoice.mode === "single") {
        await api(`/tasks/${deleteChoice.id}`, { method: "DELETE" });
        setDetailId((d) => (d === deleteChoice.id ? null : d));
        setEditId((e) => (e === deleteChoice.id ? null : e));
      } else {
        await api("/tasks/bulk", { method: "POST", body: JSON.stringify({ ids: deleteChoice.ids, action: "delete" }) });
        setSelected([]);
      }
      setDeleteChoice(null);
      load();
    } catch (e) {
      setDeleteErr(e instanceof ApiError ? e.message : "Could not move to recycle bin.");
    } finally {
      setDeleteWorking(false);
    }
  };

  const runHardDelete = async () => {
    if (!deleteChoice) return;
    if (deleteChoice.mode === "bulk" && !isCeo(user?.role)) {
      setDeleteErr("Only the CEO can permanently delete multiple tasks.");
      return;
    }
    setDeleteWorking(true);
    setDeleteErr("");
    try {
      if (deleteChoice.mode === "single") {
        await api(`/tasks/${deleteChoice.id}/hard`, { method: "DELETE" });
        setDetailId((d) => (d === deleteChoice.id ? null : d));
        setEditId((e) => (e === deleteChoice.id ? null : e));
      } else {
        await api("/tasks/bulk", { method: "POST", body: JSON.stringify({ ids: deleteChoice.ids, action: "hard_delete" }) });
        setSelected([]);
      }
      setDeleteChoice(null);
      load();
    } catch (e) {
      setDeleteErr(e instanceof ApiError ? e.message : "Could not delete permanently.");
    } finally {
      setDeleteWorking(false);
    }
  };

  const canPermanentBulk = isCeo(user?.role);
  const canPermanentSingle = isCeo(user?.role) || user?.role === "centre_head";

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status !== "all") qs.set("status", status);
    if (priority !== "all") qs.set("priority", priority);
    if (taskType !== "all") qs.set("taskType", taskType);
    if (preset.recurring === true) qs.set("recurring", "true");
    if (preset.recurring === false) qs.set("recurring", "false");
    if (preset.approval) qs.set("approval", "true");
    qs.set("limit", "50");
    api<{ tasks: Task[]; total: number }>(`/tasks?${qs.toString()}`)
      .then((d) => {
        setTasks(d.tasks);
        setTotal(d.total);
      })
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [search, status, priority, taskType, preset.recurring, preset.approval]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.matchMedia("(max-width: 767px)").matches) setView("cards");
    } catch {
      /* ignore */
    }
  }, []);

  const idList = useMemo(() => tasks.map((t) => t._id), [tasks]);

  const toggleAll = (on: boolean) => setSelected(on ? idList : []);
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)));

  const bulkMarkDone = async () => {
    if (!selected.length) return;
    await api("/tasks/bulk", { method: "POST", body: JSON.stringify({ ids: selected, status: "completed" }) });
    setSelected([]);
    load();
  };

  const rowNeedsApproval = (t: Task) => t.status === "awaiting_approval" || t.approvalStatus === "pending";

  const approveTask = async (id: string) => {
    await api(`/tasks/${id}/approve`, { method: "POST" });
    load();
  };

  const displayedId = (i: number) => 1200 + i;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="chip border border-zinc-200 bg-white text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            {preset.recurring ? "Recurring" : preset.recurring === false ? "One-time" : "All"} · Admin view
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
            {title}{" "}
            <span className="hidden font-normal text-brand-600 sm:inline sm:text-sm">(Admin View - All Team)</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
          <p className="mt-1 text-[12px] text-zinc-500">
            {loading ? "Loading…" : `${tasks.length} of ${total} task${total === 1 ? "" : "s"} found`} (All team members)
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Button variant="outline" className="w-full gap-2 sm:w-auto" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="h-4 w-4" /> {showFilters ? "Hide Filters" : "Show Filters"}
          </Button>
          <div className="inline-flex w-full rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-950 sm:w-auto">
            <button
              type="button"
              onClick={() => setView("cards")}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold", view === "cards" ? "bg-brand-gradient text-white shadow-brand" : "text-zinc-500")}
            >
              <Grid3x3 className="h-3.5 w-3.5" /> Cards
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold", view === "table" ? "bg-brand-gradient text-white shadow-brand" : "text-zinc-500")}
            >
              <Table2 className="h-3.5 w-3.5" /> Table
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="animate-fade-in rounded-xl border border-zinc-200/80 bg-white p-3 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <Input placeholder="Search tasks, description…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="awaiting_approval">Awaiting approval</option>
              <option value="completed">Completed</option>
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="all">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </Select>
            {showCadenceFilter && (
              <Select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
                <option value="all">All types</option>
                {Object.entries(CADENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 md:col-span-3">
              {selected.length > 0 && (
                <>
                  <span className="text-xs font-semibold text-zinc-500">{selected.length} selected</span>
                  <Button size="sm" variant="soft" onClick={bulkMarkDone}>Mark completed</Button>
                  <Button size="sm" variant="danger" onClick={openDeleteBulk}>
                    Delete…
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState loading={loading} />
      ) : view === "table" ? (
        <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl">
          <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <table
              className={cn(
                "w-full text-[12.5px]",
                showMasterAdmin || showApprovalQuickActions ? "min-w-[1080px]" : "min-w-[980px]"
              )}
            >
              <thead>
                <tr className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.08em] text-zinc-500 dark:bg-zinc-900">
                  <th className="w-10 p-3">
                    <input
                      type="checkbox"
                      checked={selected.length === tasks.length && tasks.length > 0}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-brand-500"
                    />
                  </th>
                  <th className="p-3 text-left">Task ID</th>
                  <th className="p-3 text-left">Task</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Priority</th>
                  <th className="p-3 text-left">Assigned By</th>
                  <th className="p-3 text-left">Assigned To</th>
                  <th className="p-3 text-left">Attachments</th>
                  <th className="p-3 text-left">Due Date</th>
                  <th className="p-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, idx) => {
                  const isChecked = selected.includes(t._id);
                  const attachments = t.attachments?.length || 0;
                  const hasVoice = !!t.voiceNoteUrl;
                  return (
                    <tr
                      key={t._id}
                      onClick={() => setDetailId(t._id)}
                      className="cursor-pointer border-t border-zinc-100 transition-colors hover:bg-brand-50/40 dark:border-zinc-800 dark:hover:bg-brand-900/10"
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => toggle(t._id, e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-brand-500"
                        />
                      </td>
                      <td className="p-3 text-zinc-500">{displayedId(idx)}</td>
                      <td className="p-3">
                        <div className="max-w-[260px]">
                          <div className="font-semibold text-zinc-800 dark:text-zinc-100">{t.title}</div>
                          {t.taskType !== "one_time" && (
                            <div className="mt-1 flex gap-1.5">
                              <span className="inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                                {t.recurrence?.forever ? "FOREVER" : "Timed"}
                              </span>
                            </div>
                          )}
                          {t.taskType !== "one_time" && (
                            <div className="mt-1 text-[10.5px] text-zinc-500">
                              Include Sunday: {t.recurrence?.includeSunday ? "Yes" : "No"} · Week Off: {t.recurrence?.weekOff || "Sunday"}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge tone={cadenceTone(t.taskType)}>{CADENCE_LABEL[t.taskType] || t.taskType}</Badge>
                      </td>
                      <td className="p-3"><Badge tone={statusTone(t.status)}>{t.status.replace("_", " ")}</Badge></td>
                      <td className="p-3">
                        <Badge tone={priorityTone(t.priority)}>
                          {t.priority === "high" && "🔥 "}
                          {t.priority.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="p-3 text-zinc-700 dark:text-zinc-200">{t.createdBy?.name || "—"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {t.assignees?.length ? (
                            t.assignees.map((a) => (
                              <span key={a._id} className="text-zinc-700 dark:text-zinc-200">
                                <div className="font-semibold">{a.name}</div>
                                <div className="text-[10px] text-zinc-500">{a.email}</div>
                              </span>
                            ))
                          ) : (
                            <span className="text-zinc-400">Unassigned</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {attachments === 0 && !hasVoice ? (
                          <span className="text-zinc-400">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {attachments > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                                <Paperclip className="h-3 w-3" /> {attachments}
                              </span>
                            )}
                            {hasVoice && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold text-rose-600 dark:bg-rose-900/30 dark:text-rose-200">
                                <Mic className="h-3 w-3" /> Voice
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-zinc-700 dark:text-zinc-200">{new Date(t.dueDate).toLocaleDateString()}</td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5 sm:gap-0.5">
                          <button
                            type="button"
                            onClick={() => setDetailId(t._id)}
                            title="View details"
                            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-brand-600 sm:h-7 sm:w-7 dark:hover:bg-zinc-800"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {showApprovalQuickActions && rowNeedsApproval(t) && (
                            <>
                              <button
                                type="button"
                                onClick={() => void approveTask(t._id)}
                                title="Approve & complete"
                                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 sm:h-7 sm:w-7 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectFor({ id: t._id, title: t.title })}
                                title="Reject…"
                                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-rose-50 hover:text-rose-600 sm:h-7 sm:w-7 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {showMasterAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditId(t._id)}
                                title="Edit task"
                                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-brand-600 sm:h-7 sm:w-7 dark:hover:bg-zinc-800"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteSingle(t._id)}
                                title="Delete task"
                                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 sm:h-7 sm:w-7 dark:hover:bg-zinc-800"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((t, idx) => (
            <div
              key={t._id}
              className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft dark:border-zinc-800 dark:bg-zinc-950"
            >
              <button type="button" onClick={() => setDetailId(t._id)} className="flex flex-1 flex-col p-4 text-left">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">#{displayedId(idx)}</span>
                  <Badge tone={cadenceTone(t.taskType)}>{CADENCE_LABEL[t.taskType] || t.taskType}</Badge>
                </div>
                <div className="mt-2 text-sm font-bold">{t.title}</div>
                <div className="mt-1 line-clamp-2 text-[11.5px] text-zinc-500">{t.description || "No description"}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone={statusTone(t.status)}>{t.status.replace("_", " ")}</Badge>
                  <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                  {(t.attachments?.length || 0) > 0 && (
                    <Badge tone="brand">
                      <Paperclip className="mr-1 h-3 w-3 inline" />
                      {t.attachments?.length}
                    </Badge>
                  )}
                  {t.voiceNoteUrl && (
                    <Badge tone="rose">
                      <Mic className="mr-1 h-3 w-3 inline" />
                      Voice
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Due {new Date(t.dueDate).toLocaleDateString()}</span>
                  <span>{t.assignees?.[0]?.name || "Unassigned"}</span>
                </div>
              </button>
              {(showApprovalQuickActions && rowNeedsApproval(t)) || showMasterAdmin ? (
                <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                  {showApprovalQuickActions && rowNeedsApproval(t) && (
                    <>
                      <Button
                        size="sm"
                        variant="gradient"
                        className="h-8 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          void approveTask(t._id);
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRejectFor({ id: t._id, title: t.title });
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {showMasterAdmin && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); setEditId(t._id); }}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); openDeleteSingle(t._id); }}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <TaskEditModal taskId={editId} open={!!editId} onClose={() => setEditId(null)} onSaved={load} />

      <Modal
        open={!!deleteChoice}
        title={
          deleteChoice?.mode === "bulk"
            ? `Delete ${deleteChoice.ids.length} task${deleteChoice.ids.length === 1 ? "" : "s"}?`
            : "Delete this task?"
        }
        onClose={() => !deleteWorking && setDeleteChoice(null)}
        className="max-w-md"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          <strong className="text-zinc-900 dark:text-zinc-100">Move to recycle bin</strong> — you can restore it later from Recycle bin.
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          <strong className="text-rose-600">Delete permanently</strong> — removes the task from the database. This cannot be undone.
        </p>
        {deleteChoice?.mode === "bulk" && !canPermanentBulk && (
          <p className="mt-2 text-xs text-zinc-500">Permanent bulk delete is available to the CEO only.</p>
        )}
        {deleteErr && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
            {deleteErr}
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={() => setDeleteChoice(null)} disabled={deleteWorking}>
            Cancel
          </Button>
          <Button variant="soft" onClick={() => void runSoftDelete()} disabled={deleteWorking}>
            {deleteWorking ? "Working…" : "Move to recycle bin"}
          </Button>
          {(deleteChoice?.mode === "single" ? canPermanentSingle : canPermanentBulk) && (
            <Button variant="danger" onClick={() => void runHardDelete()} disabled={deleteWorking}>
              Delete permanently
            </Button>
          )}
        </div>
      </Modal>

      <TaskDetailDrawer
        taskId={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        onUpdated={load}
      />

      <RejectTaskModal
        open={!!rejectFor}
        taskId={rejectFor?.id ?? null}
        taskTitle={rejectFor?.title ?? ""}
        onClose={() => setRejectFor(null)}
        onSuccess={() => {
          setRejectFor(null);
          load();
        }}
      />
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center shadow-card dark:border-zinc-700 dark:bg-zinc-950 sm:rounded-2xl sm:p-16">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        {loading ? <Layers className="h-6 w-6 text-zinc-400 animate-pulse" /> : <Inbox className="h-6 w-6 text-zinc-400" />}
      </div>
      <div className="mt-4 text-sm font-semibold text-zinc-600">{loading ? "Loading tasks…" : "No tasks found"}</div>
      <p className="mt-1 max-w-sm text-xs text-zinc-500">
        {loading ? "Fetching from the API." : "Try adjusting your filters or create a new task from Assign Task."}
      </p>
    </div>
  );
}
