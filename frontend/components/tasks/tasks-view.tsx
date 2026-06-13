"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge, cadenceTone, priorityTone, statusTone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useCelebration } from "@/contexts/celebration-context";
import { isCeo, isManagement } from "@/lib/roles";
import { CheckCircle2, Eye, Filter, Grid3x3, Inbox, Mic, Paperclip, Pencil, Search, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { calendarDayKeyInTz, formatAppDate, formatAppDateTime } from "@/lib/date-format";
import { TaskDetailDrawer } from "./task-detail-drawer";
import { TaskEditModal } from "./task-edit-modal";
import { RejectTaskModal } from "./reject-task-modal";
import { SubmitForApprovalModal } from "./submit-for-approval-modal";

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
  assignedBy?: { _id: string; name: string; email?: string };
  createdBy?: { _id: string; name: string; email?: string };
  submissionRemarks?: string;
  notDoneApproval?: { dueDate?: string; remarks?: string; status?: string };
  attachments?: { name: string; url?: string }[];
  voiceNoteUrl?: string;
  /** Master list: live task is pending but has approved history rows. */
  masterDisplayStatus?: "approved" | "rejected";
  masterLastClosedAt?: string | null;
  masterLastOccurrenceDue?: string | null;
  masterHistoryCount?: number;
  /** For Approval inbox: occurrence from pending approval record (IST). */
  pendingOccurrenceDueDate?: string | null;
  pendingRecordId?: string;
  inboxRowKey?: string;
  pendingSubmittedAt?: string | null;
  submissionSource?: "assignee" | "assigner_reopen";
};

type Preset = {
  recurring?: boolean;
  status?: string;
  statusGroup?: "open";
  approval?: boolean;
  /** Recurring assignee lists: only due today or earlier (not tomorrow+). */
  workableToday?: boolean;
  /** Pending inbox: tasks assigned to the signed-in user. */
  myTasks?: boolean;
  /** Assignee work inbox: exclude tasks already submitted for approval. */
  assigneeInbox?: boolean;
};

function taskAssigner(t: Task) {
  return t.assignedBy || t.createdBy;
}

function UserNameEmail({ name, email }: { name?: string; email?: string }) {
  if (!name && !email) return <span>—</span>;
  return (
    <span className="block">
      {name ? <span className="text-zinc-700 dark:text-zinc-200">{name}</span> : null}
      {email ? <span className="block text-[10px] font-normal text-zinc-500">{email}</span> : null}
    </span>
  );
}

const CADENCE_LABEL: Record<string, string> = {
  one_time: "One Time",
  daily: "Daily",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

function taskStatusAccent(status: string) {
  const key = status.replace(/-/g, "_");
  const map: Record<string, string> = {
    pending: "status-accent-pending",
    in_progress: "status-accent-in_progress",
    awaiting_approval: "status-accent-awaiting_approval",
    completed: "status-accent-completed",
    overdue: "status-accent-overdue",
    cancelled: "status-accent-cancelled",
  };
  return map[key] || "status-accent-pending";
}

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
  /** Master Single / Recurring: Edit & Delete only on tasks the signed-in user created. */
  masterAdminActions?: boolean;
}) {
  const { user } = useAuth();
  const { celebrate } = useCelebration();
  const myId = user?._id ? String(user._id) : "";
  const taskAssignerId = (t: Task) => String(t.assignedBy?._id || t.createdBy?._id || "");
  const canEditTaskAsAssigner = (t: Task) =>
    Boolean(myId && taskAssignerId(t) === myId && (isManagement(user?.role) || isCeo(user?.role)));
  const isCeoMasterView = Boolean(masterAdminActions && isCeo(user?.role));
  const canManageOwnMasterTask = (t: Task) =>
    Boolean(masterAdminActions && (isCeoMasterView || canEditTaskAsAssigner(t)));
  const showApprovalQuickActions = Boolean(preset.approval && isManagement(user?.role));
  const showApprovalFilters = Boolean(preset.approval && (isManagement(user?.role) || isCeo(user?.role)));

  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(masterAdminActions || Boolean(preset.approval));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
  const [submitBulkOpen, setSubmitBulkOpen] = useState(false);
  const [masterRelation, setMasterRelation] = useState<"created" | "assigned">("created");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [approvalDueDate, setApprovalDueDate] = useState("");
  const [approvalAssignee, setApprovalAssignee] = useState("all");
  const [myAssignees, setMyAssignees] = useState<{ _id: string; name: string; email: string }[]>([]);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const canFilterByAssignee = Boolean(
    (masterAdminActions || showApprovalFilters) && (isManagement(user?.role) || isCeo(user?.role))
  );

  const flashCompleted = (ids: string[]) => {
    setFlashIds(ids);
    window.setTimeout(() => setFlashIds([]), 900);
  };

  useEffect(() => {
    if (!canFilterByAssignee) return;
    api<{ assignees: { _id: string; name: string; email: string }[] }>("/dashboard/my-assignees")
      .then((d) => setMyAssignees(d.assignees || []))
      .catch(() => setMyAssignees([]));
  }, [canFilterByAssignee]);

  useEffect(() => {
    if (masterRelation === "assigned") setAssigneeFilter("all");
  }, [masterRelation]);

  const openDeleteSingle = (id: string) => {
    const t = tasks.find((x) => x._id === id);
    if (masterAdminActions) {
      if (!t || !canManageOwnMasterTask(t)) return;
    }
    setDeleteErr("");
    setDeleteChoice({ mode: "single", id });
  };

  const openDeleteBulk = () => {
    if (!selected.length) return;
    const ids =
      masterAdminActions
        ? selected.filter((id) => {
            const t = tasks.find((x) => x._id === id);
            return t && canManageOwnMasterTask(t);
          })
        : [...selected];
    if (!ids.length) return;
    setDeleteErr("");
    setDeleteChoice({ mode: "bulk", ids });
  };

  const canBulkDelete =
    selected.length > 0 &&
    (!masterAdminActions ||
      selected.every((id) => {
        const t = tasks.find((x) => x._id === id);
        return t ? canManageOwnMasterTask(t) : false;
      }));

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

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(handle);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (status !== "all") qs.set("status", status);
    if (priority !== "all") qs.set("priority", priority);
    if (taskType !== "all") qs.set("taskType", taskType);
    if (preset.recurring === true) qs.set("recurring", "true");
    if (preset.recurring === false) qs.set("recurring", "false");
    if (preset.statusGroup) qs.set("statusGroup", preset.statusGroup);
    if (preset.approval) qs.set("approval", "true");
    if (preset.approval && approvalDueDate) qs.set("approvalDueDate", approvalDueDate);
    if (preset.approval && approvalAssignee !== "all") qs.set("assignee", approvalAssignee);
    if (preset.workableToday) qs.set("workableToday", "true");
    if (preset.myTasks) qs.set("myTasks", "true");
    if (preset.assigneeInbox) qs.set("assigneeInbox", "true");
    if (masterAdminActions) {
      qs.set("masterScope", "true");
      if (!isCeoMasterView) {
        qs.set("masterRelation", masterRelation);
      }
      if ((isCeoMasterView || masterRelation === "created") && assigneeFilter !== "all") {
        qs.set("assignee", assigneeFilter);
      }
    }
    qs.set("limit", isCeoMasterView ? "200" : masterAdminActions ? "100" : preset.approval ? "100" : "50");
    api<{ tasks: Task[]; total: number }>(`/tasks?${qs.toString()}`)
      .then((d) => {
        setTasks(d.tasks);
        setTotal(d.total);
      })
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [debouncedSearch, status, priority, taskType, preset.recurring, preset.statusGroup, preset.approval, preset.workableToday, preset.myTasks, preset.assigneeInbox, masterAdminActions, isCeoMasterView, masterRelation, assigneeFilter, approvalDueDate, approvalAssignee]);

  useEffect(() => {
    load();
  }, [load]);

  const idList = useMemo(() => tasks.map((t) => t._id), [tasks]);
  const orderedTasks = useMemo(() => {
    const todayKey = calendarDayKeyInTz(new Date().toISOString());
    const list = preset.workableToday
      ? tasks.filter((t) =>
          t.taskType === "daily"
            ? calendarDayKeyInTz(t.dueDate) === todayKey
            : calendarDayKeyInTz(t.dueDate) <= todayKey
        )
      : tasks;
    const myId = user?._id;
    if (!myId || user?.role !== "supervisor") return list;
    return [...list].sort((a, b) => {
      const aMineFromOthers = Boolean(a.assignees?.some((assignee) => assignee._id === myId) && a.createdBy?._id !== myId);
      const bMineFromOthers = Boolean(b.assignees?.some((assignee) => assignee._id === myId) && b.createdBy?._id !== myId);
      if (aMineFromOthers === bMineFromOthers) return 0;
      return aMineFromOthers ? -1 : 1;
    });
  }, [tasks, user?._id, user?.role, preset.workableToday]);

  const toggleAll = (on: boolean) => setSelected(on ? idList : []);
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)));

  const bulkMarkDone = () => {
    if (!selected.length) return;
    if (isCeo(user?.role)) {
      void (async () => {
        await api("/tasks/bulk", { method: "POST", body: JSON.stringify({ ids: selected, status: "completed" }) });
        flashCompleted(selected);
        setSelected([]);
        celebrate("complete", `${selected.length} task${selected.length === 1 ? "" : "s"} completed!`);
        load();
      })();
      return;
    }
    setSubmitBulkOpen(true);
  };

  const rowNeedsApproval = (t: Task) =>
    t.status === "awaiting_approval" || t.approvalStatus === "pending" || t.notDoneApproval?.status === "pending";

  const approveTask = async (id: string, occurrenceDueDate?: string | null) => {
    await api(`/tasks/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(occurrenceDueDate ? { occurrenceDueDate } : {}),
    });
    flashCompleted([id]);
    celebrate("approve");
    load();
  };

  const canSendBackForApproval = (t: Task) =>
    canEditTaskAsAssigner(t) &&
    (t.status === "completed" ||
      t.status === "cancelled" ||
      t.masterDisplayStatus === "approved" ||
      t.masterDisplayStatus === "rejected");

  const sendBackForApproval = async (id: string, occurrenceDueDate?: string | null) => {
    await api(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        sendBackForApproval: true,
        ...(occurrenceDueDate ? { occurrenceDueDate } : {}),
      }),
    });
    load();
  };

  const isAssigneeOnTask = (t: Task) => Boolean(myId && t.assignees?.some((a) => String(a._id) === myId));

  const canResubmitTask = (t: Task) =>
    t.taskType === "daily" &&
    t.notDoneApproval?.status !== "pending" &&
    ((t.status === "awaiting_approval" && t.approvalStatus === "pending") ||
      (t.status === "completed" && (t.approvalStatus === "approved" || t.masterDisplayStatus === "approved"))) &&
    (isAssigneeOnTask(t) || canEditTaskAsAssigner(t));

  const resubmitTask = async (id: string) => {
    await api(`/tasks/${id}/resubmit`, { method: "POST" });
    load();
  };

  const displayedId = (i: number) => 1200 + i;

  const taskListDueLabel = (t: Task) =>
    formatAppDateTime(t.pendingOccurrenceDueDate || t.dueDate);

  const taskStatusLabel = (t: Task) => {
    if (t.masterDisplayStatus === "approved") return "Approved";
    if (t.masterDisplayStatus === "rejected") return "Rejected";
    if (
      t.taskType === "daily" &&
      t.status === "overdue" &&
      calendarDayKeyInTz(t.dueDate) === calendarDayKeyInTz(new Date().toISOString())
    ) {
      return "Due today";
    }
    return t.status.replace(/_/g, " ");
  };

  const taskStatusBadgeTone = (t: Task) => {
    if (t.masterDisplayStatus === "approved") return statusTone("completed");
    if (t.masterDisplayStatus === "rejected") return statusTone("cancelled");
    if (
      t.taskType === "daily" &&
      t.status === "overdue" &&
      calendarDayKeyInTz(t.dueDate) === calendarDayKeyInTz(new Date().toISOString())
    ) {
      return statusTone("pending");
    }
    return statusTone(t.status);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        chip={`${preset.recurring ? "Recurring" : preset.recurring === false ? "One-time" : "All"}${isCeoMasterView ? " · All team" : masterAdminActions ? " · Your tasks" : preset.approval ? " · Approval" : ""}`}
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Button variant="outline" className="w-full gap-2 sm:w-auto" onClick={() => setShowFilters((v) => !v)}>
              <Filter className="h-4 w-4" /> {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
            <div className="segment-control w-full sm:w-auto">
              <button type="button" className={cn("segment-btn segment-btn-active flex items-center gap-1.5 px-3 py-1.5")}>
                <Grid3x3 className="h-3.5 w-3.5" /> Cards
              </button>
            </div>
          </>
        }
      >
        {masterAdminActions && !isCeoMasterView && (
          <div className="segment-control mt-3">
            <button
              type="button"
              onClick={() => setMasterRelation("created")}
              className={cn("segment-btn", masterRelation === "created" && "segment-btn-active")}
            >
              Assigned by me
            </button>
            <button
              type="button"
              onClick={() => setMasterRelation("assigned")}
              className={cn("segment-btn", masterRelation === "assigned" && "segment-btn-active")}
            >
              Assigned to me
            </button>
          </div>
        )}
        <p className="mt-2 text-[12px] text-zinc-500">
          {loading ? "Loading…" : `${orderedTasks.length} of ${total} task${total === 1 ? "" : "s"} found`}
          {isCeoMasterView
            ? assigneeFilter !== "all"
              ? ` · filtered to ${myAssignees.find((a) => a._id === assigneeFilter)?.name || "selected person"}`
              : " · all team members across every center"
            : masterAdminActions
              ? masterRelation === "created"
                ? assigneeFilter !== "all"
                  ? ` · tasks you assigned to ${myAssignees.find((a) => a._id === assigneeFilter)?.name || "selected person"}`
                  : " · only tasks you assigned"
                : " · tasks assigned to you"
              : preset.approval
                ? [
                    approvalDueDate ? ` · due ${formatAppDate(approvalDueDate)}` : "",
                    approvalAssignee !== "all"
                      ? ` · ${myAssignees.find((a) => a._id === approvalAssignee)?.name || "selected person"}`
                      : "",
                  ].join("")
                : ""}
        </p>
      </PageHeader>

      {showFilters && (
        <div className="filter-panel">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {showApprovalFilters ? (
              <>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-zinc-500">Due date (occurrence)</span>
                  <Input
                    type="date"
                    value={approvalDueDate}
                    onChange={(e) => setApprovalDueDate(e.target.value)}
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-zinc-500">Team member</span>
                  <SearchableSelect
                    value={approvalAssignee}
                    onChange={setApprovalAssignee}
                    placeholder="All team members"
                    searchPlaceholder="Search name or email…"
                    options={[
                      { value: "all", label: "All team members", searchText: "all" },
                      ...myAssignees.map((a) => ({
                        value: a._id,
                        label: `${a.name}${a.email ? ` (${a.email})` : ""}`,
                        searchText: `${a.name} ${a.email || ""}`,
                      })),
                    ]}
                  />
                </label>
                <div className="relative sm:col-span-2 md:col-span-4">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    placeholder="Search task title or description…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {(approvalDueDate || approvalAssignee !== "all" || search) && (
                  <div className="sm:col-span-2 md:col-span-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setApprovalDueDate("");
                        setApprovalAssignee("all");
                        setSearch("");
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <Input placeholder="Search tasks, people, description…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="awaiting_approval">Awaiting approval</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Rejected / cancelled</option>
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
            {canFilterByAssignee && (isCeoMasterView || masterRelation === "created") && (
              <SearchableSelect
                value={assigneeFilter}
                onChange={setAssigneeFilter}
                placeholder="All assignees"
                searchPlaceholder="Search assignee…"
                options={[
                  { value: "all", label: "All assignees", searchText: "all" },
                  ...myAssignees.map((a) => ({
                    value: a._id,
                    label: `${a.name}${a.email ? ` (${a.email})` : ""}`,
                    searchText: `${a.name} ${a.email || ""}`,
                  })),
                ]}
              />
            )}
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 md:col-span-3">
              {selected.length > 0 && (
                <>
                  <span className="text-xs font-semibold text-zinc-500">{selected.length} selected</span>
                  <Button size="sm" variant="soft" onClick={bulkMarkDone}>
                    {isCeo(user?.role) ? "Mark completed" : "Submit for approval"}
                  </Button>
                  {canBulkDelete && (
                    <Button size="sm" variant="danger" onClick={openDeleteBulk}>
                      Delete…
                    </Button>
                  )}
                </>
              )}
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {orderedTasks.length === 0 ? (
        <EmptyState
          loading={loading}
          variant={preset.assigneeInbox && !loading ? "motivate" : "default"}
          title={loading ? "Loading tasks…" : preset.assigneeInbox ? "Your inbox is clear" : "No tasks found"}
          description={
            loading
              ? "Fetching from the API."
              : preset.assigneeInbox
                ? "Nothing pending right now — great job staying on top of things!"
                : "Try adjusting your filters or create a new task from Assign Task."
          }
        />
      ) : false ? (
        <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl">
          <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <table
              className={cn(
                "w-full text-[12.5px]",
                masterAdminActions || showApprovalQuickActions ? "min-w-[1080px]" : "min-w-[980px]"
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
                {orderedTasks.map((t, idx) => {
                  const isChecked = selected.includes(t._id);
                  const attachments = t.attachments?.length || 0;
                  const hasVoice = !!t.voiceNoteUrl;
                  return (
                    <tr
                      key={t.inboxRowKey || t._id}
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
                      <td className="p-3"><Badge tone={taskStatusBadgeTone(t)}>{taskStatusLabel(t)}</Badge></td>
                      <td className="p-3">
                        <Badge tone={priorityTone(t.priority)}>
                          {t.priority === "high" && "🔥 "}
                          {t.priority.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <UserNameEmail name={taskAssigner(t)?.name} email={taskAssigner(t)?.email} />
                      </td>
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
                      <td className="p-3 text-zinc-700 dark:text-zinc-200">{taskListDueLabel(t)}</td>
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
                                onClick={() => void approveTask(t._id, t.pendingOccurrenceDueDate || t.dueDate)}
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
                          {canResubmitTask(t) && (
                            <button
                              type="button"
                              onClick={() => void resubmitTask(t._id)}
                              title={canEditTaskAsAssigner(t) && !isAssigneeOnTask(t) ? "Resubmit to assignee" : "Resubmit"}
                              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-brand-50 hover:text-brand-600 sm:h-7 sm:w-7 dark:hover:bg-brand-950/40 dark:hover:text-brand-400"
                            >
                              <Inbox className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {(canManageOwnMasterTask(t) || (preset.approval && canEditTaskAsAssigner(t))) && (
                            <button
                              type="button"
                              onClick={() => setEditId(t._id)}
                              title="Edit task"
                              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-brand-600 sm:h-7 sm:w-7 dark:hover:bg-zinc-800"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canManageOwnMasterTask(t) && (
                            <button
                              type="button"
                              onClick={() => openDeleteSingle(t._id)}
                              title="Delete task"
                              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 sm:h-7 sm:w-7 dark:hover:bg-zinc-800"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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
          {orderedTasks.map((t, idx) => (
            <motion.div
              key={t.inboxRowKey || t._id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: Math.min(idx * 0.04, 0.32) }}
              className={cn(
                "interactive-card flex flex-col border-white/80 dark:border-zinc-800/80",
                taskStatusAccent(t.masterDisplayStatus === "approved" ? "completed" : t.status),
                flashIds.includes(t._id) && "task-complete-flash ring-2 ring-emerald-400/60"
              )}
            >
              <button type="button" onClick={() => setDetailId(t._id)} className="relative flex flex-1 flex-col p-4 text-left">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">#{displayedId(idx)}</span>
                  <Badge tone={cadenceTone(t.taskType)}>{CADENCE_LABEL[t.taskType] || t.taskType}</Badge>
                </div>
                <div className="mt-2 text-sm font-bold">{t.title}</div>
                <div className="mt-1 line-clamp-2 text-[11.5px] text-zinc-500">{t.description || "No description"}</div>
                {preset.approval && (t.submissionRemarks || t.notDoneApproval?.remarks) ? (
                  <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/80 px-2 py-1.5 text-[11px] text-brand-950 dark:border-brand-800 dark:bg-brand-950/50 dark:text-brand-100">
                    <span className="font-semibold">
                      {t.notDoneApproval?.status === "pending"
                        ? "Not done: "
                        : (t as Task & { submissionSource?: string }).submissionSource === "assigner_reopen"
                          ? "Sent back by assigner: "
                          : "Submission remarks: "}
                    </span>
                    <span className="whitespace-pre-wrap">{t.notDoneApproval?.remarks || t.submissionRemarks}</span>
                    {(t as Task & { pendingSubmittedAt?: string }).pendingSubmittedAt ? (
                      <div className="mt-1 text-[10px] text-zinc-600 dark:text-zinc-400">
                        Submitted {formatAppDateTime((t as Task & { pendingSubmittedAt?: string }).pendingSubmittedAt)}
                      </div>
                    ) : null}
                    {t.notDoneApproval?.dueDate ? (
                      <div className="mt-1 text-[10px] text-zinc-600 dark:text-zinc-400">
                        Occurrence due {formatAppDate(t.notDoneApproval.dueDate)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {masterAdminActions ? (
                  <div className="mt-2 space-y-1.5 text-[11px] text-zinc-500">
                    <div>
                      <span className="font-semibold text-zinc-600 dark:text-zinc-300">Assigned by</span>
                      <div className="mt-0.5">
                        <UserNameEmail name={taskAssigner(t)?.name} email={taskAssigner(t)?.email} />
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-600 dark:text-zinc-300">Assigned to</span>
                      {t.assignees?.length ? (
                        <ul className="mt-0.5 space-y-1">
                          {t.assignees.map((a) => (
                            <li key={a._id}>
                              <UserNameEmail name={a.name} email={a.email} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="mt-0.5 block">—</span>
                      )}
                    </div>
                  </div>
                ) : null}
                {masterAdminActions && t.masterDisplayStatus && t.masterLastClosedAt ? (
                  <div className="mt-2 text-[11px] text-zinc-500">
                    Last {t.masterDisplayStatus === "approved" ? "approved" : "rejected"}{" "}
                    {formatAppDateTime(t.masterLastClosedAt)}
                    {t.masterLastOccurrenceDue
                      ? ` · occurrence ${formatAppDate(t.masterLastOccurrenceDue)}`
                      : ""}
                    {t.masterHistoryCount && t.masterHistoryCount > 1 ? ` · ${t.masterHistoryCount} in history` : ""}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone={taskStatusBadgeTone(t)}>{taskStatusLabel(t)}</Badge>
                  {t.masterDisplayStatus && t.status !== t.masterDisplayStatus ? (
                    <Badge tone={statusTone(t.status)}>Live: {t.status.replace(/_/g, " ")}</Badge>
                  ) : null}
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
                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                  <span>Due {taskListDueLabel(t)}</span>
                  {!masterAdminActions && (
                    <span className="truncate text-right">{t.assignees?.[0]?.name || "Unassigned"}</span>
                  )}
                </div>
              </button>
              {(showApprovalQuickActions && rowNeedsApproval(t)) ||
              canResubmitTask(t) ||
              canManageOwnMasterTask(t) ||
              (preset.approval && canEditTaskAsAssigner(t)) ||
              (masterAdminActions && canSendBackForApproval(t)) ? (
                <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100/80 bg-gradient-to-r from-zinc-50/80 to-transparent px-3 py-2 dark:border-zinc-800 dark:from-zinc-900/40">
                  {showApprovalQuickActions && rowNeedsApproval(t) && (
                    <>
                      <Button
                        size="sm"
                        variant="gradient"
                        className="h-8 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          void approveTask(t._id, t.pendingOccurrenceDueDate || t.dueDate);
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
                  {canResubmitTask(t) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        void resubmitTask(t._id);
                      }}
                    >
                      {canEditTaskAsAssigner(t) && !isAssigneeOnTask(t) ? "Resubmit to assignee" : "Resubmit"}
                    </Button>
                  )}
                  {canSendBackForApproval(t) && (
                    <Button
                      size="sm"
                      variant="gradient"
                      className="h-8 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        void sendBackForApproval(t._id, t.masterLastOccurrenceDue || t.dueDate);
                      }}
                    >
                      Send back to For Approval
                    </Button>
                  )}
                  {(canManageOwnMasterTask(t) || (preset.approval && canEditTaskAsAssigner(t))) && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); setEditId(t._id); }}>
                      Edit
                    </Button>
                  )}
                  {canManageOwnMasterTask(t) && (
                    <Button size="sm" variant="danger" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); openDeleteSingle(t._id); }}>
                      Delete
                    </Button>
                  )}
                </div>
              ) : null}
            </motion.div>
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
        onRequestEdit={(id) => {
          setDetailId(null);
          setEditId(id);
        }}
        onSendBackForApproval={async (id, occurrenceDueDate) => {
          await sendBackForApproval(id, occurrenceDueDate);
          setDetailId(null);
        }}
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

      <SubmitForApprovalModal
        open={submitBulkOpen}
        taskIds={selected}
        onClose={() => setSubmitBulkOpen(false)}
        onSuccess={() => {
          setSubmitBulkOpen(false);
          setSelected([]);
          load();
        }}
      />
    </div>
  );
}
