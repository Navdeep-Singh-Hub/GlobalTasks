"use client";

import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api, ApiError, API_ORIGIN, getToken } from "@/lib/api";
import { formatCenterName } from "@/lib/utils";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Mic,
  Paperclip,
  Plus,
  RotateCcw,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useCelebration } from "@/contexts/celebration-context";
import { isCeo, isManagement } from "@/lib/roles";
import { useEffect, useMemo, useState } from "react";

type UserLite = {
  _id: string;
  name: string;
  email: string;
  role: string;
  centerId?: string | { _id: string; name: string; code?: string } | null;
};
type CenterLite = { _id: string; name: string; code: string };
type DepartmentLite = { _id: string; name: string; code: string };

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const TYPES: { value: string; label: string }[] = [
  { value: "one_time", label: "One Time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

type Draft = {
  id: number;
  title: string;
  description: string;
  taskType: string;
  priority: string;
  assignees: string[];
  requiresApproval: boolean;
  dueDate: string;
  dueTime: string;
  centerId: string;
  departmentId: string;
  forever: boolean;
  includeSunday: boolean;
  weekOff: string;
  attachments: File[];
  voiceBlob: Blob | null;
  voicePreviewUrl: string | null;
};

/** Stable center id for comparisons whether API populated `centerId` or left it as an id string. */
function userCenterIdRef(u: UserLite): string {
  const c = u.centerId;
  if (!c) return "";
  if (typeof c === "object") return String(c._id || "");
  return String(c);
}

function userCenterLabel(u: UserLite, centers: CenterLite[]): string {
  const c = u.centerId;
  if (c && typeof c === "object" && "name" in c) {
    const code = c.code ? ` · ${c.code}` : "";
    return `${formatCenterName(c.name)}${code}`;
  }
  const id = typeof c === "string" ? c : "";
  if (id) {
    const found = centers.find((x) => String(x._id) === String(id));
    if (found) {
      const code = found.code ? ` · ${found.code}` : "";
      return `${formatCenterName(found.name)}${code}`;
    }
  }
  return "—";
}

function emptyDraft(id: number): Draft {
  return {
    id,
    title: "",
    description: "",
    taskType: "one_time",
    priority: "normal",
    assignees: [],
    requiresApproval: false,
    dueDate: "",
    dueTime: "23:59",
    centerId: "",
    departmentId: "",
    forever: true,
    includeSunday: false,
    weekOff: "Sunday",
    attachments: [],
    voiceBlob: null,
    voicePreviewUrl: null,
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function defaultDueTime() {
  return "23:59";
}

function combineDueDateTime(date: string, time: string): Date {
  const normalizedTime = String(time || defaultDueTime()).trim() || defaultDueTime();
  return new Date(`${date}T${normalizedTime}:00+05:30`);
}

function normalizeDraft(d: Draft): Draft {
  const normalizedAssignees = Array.from(
    new Set(
      (Array.isArray(d.assignees) ? d.assignees : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  const recurring = d.taskType !== "one_time";
  const normalizedDueDate = String(d.dueDate || "").trim() || (recurring && d.forever ? todayIsoDate() : "");
  const normalizedDueTime = String(d.dueTime || "").trim() || defaultDueTime();
  return {
    ...d,
    title: String(d.title || "").trim(),
    description: String(d.description || "").trim(),
    centerId: String(d.centerId || "").trim(),
    departmentId: String(d.departmentId || "").trim(),
    dueDate: normalizedDueDate,
    dueTime: normalizedDueTime,
    assignees: normalizedAssignees,
  };
}

function missingFieldsForDraft(d: Draft): string[] {
  const missing: string[] = [];
  if (!d.title) missing.push("title");
  if (!d.description) missing.push("description");
  if (!d.centerId) missing.push("center");
  if (!d.departmentId) missing.push("department");
  if (!d.dueDate) missing.push("due date");
  if (!Array.isArray(d.assignees) || d.assignees.length === 0) missing.push("assignee");
  return missing;
}

async function uploadAttachments(files: File[]): Promise<{ name: string; url: string; size: number; mimeType?: string }[]> {
  if (!files.length) return [];
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f, f.name));
  const token = getToken();
  const res = await fetch(`${API_ORIGIN}/api/uploads`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "File upload failed");
  }
  const data = await res.json();
  return data.files;
}

async function uploadVoice(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, `voice-${Date.now()}.webm`);
  const token = getToken();
  const res = await fetch(`${API_ORIGIN}/api/uploads/voice`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new Error("Voice upload failed");
  const data = await res.json();
  return data.url;
}

export function AssignTaskForm() {
  const { user } = useAuth();
  const { celebrate } = useCelebration();
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft(1)]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [departments, setDepartments] = useState<DepartmentLite[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const crossCenterAssign = Boolean(user?.canAssignAcrossCenters);
  const pickerCenterId = drafts[0]?.centerId || "";

  useEffect(() => {
    api<{ centers: CenterLite[] }>("/centers").then((d) => setCenters(d.centers)).catch(() => setCenters([]));
    api<{ departments: DepartmentLite[] }>("/departments").then((d) => setDepartments(d.departments)).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    const canPickAssignees = user?.role && (isManagement(user.role) || isCeo(user.role));
    if (!canPickAssignees) {
      setUsers([]);
      return;
    }
    if (!pickerCenterId && !crossCenterAssign) {
      setUsers([]);
      return;
    }
    const qs = new URLSearchParams();
    qs.set("assignable", "true");
    qs.set("status", "active");
    if (pickerCenterId) qs.set("centerId", pickerCenterId);
    api<{ users: UserLite[] }>(`/users?${qs.toString()}`)
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]));
  }, [user?.role, user?.canAssignAcrossCenters, pickerCenterId, crossCenterAssign]);

  const createdCount = drafts.length;

  const addDraft = () => setDrafts((d) => [...d, emptyDraft(d.length + 1)]);
  const resetAll = () => setDrafts([emptyDraft(1)]);
  const updateDraft = (id: number, patch: Partial<Draft>) => setDrafts((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const toggleDraftAssignee = (id: number, userId: string) =>
    setDrafts((list) =>
      list.map((d) =>
        d.id === id
          ? {
              ...d,
              assignees: d.assignees.includes(userId)
                ? d.assignees.filter((aid) => aid !== userId)
                : [...d.assignees, userId],
            }
          : d
      )
    );

  const submit = async () => {
    const normalizedDrafts = drafts.map(normalizeDraft);
    const invalid = normalizedDrafts.find((d) => missingFieldsForDraft(d).length > 0);
    if (invalid) {
      const missing = missingFieldsForDraft(invalid);
      setMessage({
        type: "error",
        text: `Task #${invalid.id}: missing ${missing.join(", ")}.`,
      });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      for (const d of normalizedDrafts) {
        const [attachments, voiceNoteUrl] = await Promise.all([
          uploadAttachments(d.attachments),
          d.voiceBlob ? uploadVoice(d.voiceBlob) : Promise.resolve(""),
        ]);
        const dueDateObj = combineDueDateTime(d.dueDate, d.dueTime);
        if (Number.isNaN(dueDateObj.getTime())) {
          throw new Error(`Task #${d.id}: invalid due date or time`);
        }
        const dueDateIso = dueDateObj.toISOString();
        await api("/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: d.title,
            description: d.description,
            centerId: d.centerId,
            departmentId: d.departmentId,
            taskType: d.taskType,
            priority: d.priority,
            assignees: d.assignees,
            requiresApproval: d.requiresApproval,
            dueDate: dueDateIso,
            recurrence: {
              forever: d.forever,
              includeSunday: d.includeSunday,
              weekOff: d.weekOff,
            },
            requiredInputsSchema: {
              type: "object",
              properties: {},
              required: [],
            },
            attachments,
            voiceNoteUrl,
          }),
        });
      }
      setMessage({ type: "success", text: `Created ${drafts.length} task${drafts.length > 1 ? "s" : ""} successfully.` });
      celebrate("assign", `${drafts.length} task${drafts.length > 1 ? "s" : ""} assigned!`);
      resetAll();
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed to create tasks.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-card space-y-4 p-4 sm:space-y-5 sm:p-5">
      {crossCenterAssign && (
        <div className="rounded-xl border border-brand-200/80 bg-brand-50/80 px-4 py-3 text-sm text-brand-800 dark:border-brand-800/60 dark:bg-brand-950/40 dark:text-brand-200">
          You can assign tasks in <strong>any center</strong> and to <strong>all active staff</strong> in that center (every role except CEO).
        </div>
      )}
      {drafts.map((d, idx) => (
        <DraftCard
          key={d.id}
          index={idx + 1}
          draft={d}
          users={users}
          centers={centers}
          departments={departments}
          crossCenterAssign={crossCenterAssign}
          onChange={(patch) => updateDraft(d.id, patch)}
          onToggleAssignee={(userId) => toggleDraftAssignee(d.id, userId)}
          onRemove={drafts.length > 1 ? () => setDrafts((list) => list.filter((x) => x.id !== d.id)) : undefined}
        />
      ))}

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:rounded-2xl">
        <Button variant="outline" onClick={resetAll} className="w-full gap-2 sm:w-auto">
          <RotateCcw className="h-4 w-4" /> Reset All
        </Button>
        <div className="flex items-center justify-end gap-3 sm:justify-start">
          <button
            type="button"
            onClick={addDraft}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow hover:bg-emerald-600"
            aria-label="Add task"
          >
            <Plus className="h-5 w-5" />
          </button>
          <Button variant="gradient" onClick={submit} disabled={submitting} className="min-w-0 flex-1 gap-2 sm:flex-initial">
            <Zap className="h-4 w-4" />
            {submitting ? "Creating…" : "Create All Tasks"}
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-bold">{createdCount}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function DraftCard({
  index,
  draft,
  users,
  centers,
  departments,
  crossCenterAssign,
  onChange,
  onToggleAssignee,
  onRemove,
}: {
  index: number;
  draft: Draft;
  users: UserLite[];
  centers: CenterLite[];
  departments: DepartmentLite[];
  crossCenterAssign?: boolean;
  onChange: (p: Partial<Draft>) => void;
  onToggleAssignee: (userId: string) => void;
  onRemove?: () => void;
}) {
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");

  const usersInSelectedCenter = useMemo(() => {
    if (!draft.centerId) return crossCenterAssign ? users : [];
    const center = String(draft.centerId);
    return users.filter((u) => {
      const uid = userCenterIdRef(u);
      return uid === center || !uid;
    });
  }, [users, draft.centerId, crossCenterAssign]);

  const selectedNames = useMemo(
    () => users.filter((u) => draft.assignees.includes(u._id)).map((u) => u.name),
    [users, draft.assignees]
  );
  const filteredUsers = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    const pool = usersInSelectedCenter;
    if (!q) return pool;
    return pool.filter((u) => {
      const name = String(u.name || "").toLowerCase();
      const email = String(u.email || "").toLowerCase();
      const role = String(u.role || "").toLowerCase();
      const center = userCenterLabel(u, centers).toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q) || center.includes(q);
    });
  }, [usersInSelectedCenter, assigneeSearch, centers]);

  const isRecurring = draft.taskType !== "one_time";
  const typeLabel = TYPES.find((t) => t.value === draft.taskType)?.label || "One Time";

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-[13px] font-bold text-white shadow-brand">
            {String(index).padStart(2, "0")}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-bold tracking-tight">Task {index}</h3>
              {isRecurring && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  Recurring
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-500">{typeLabel} task</div>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto sm:justify-end">
          {onRemove && (
            <button onClick={onRemove} className="min-h-10 px-2 text-xs text-zinc-400 hover:text-rose-500 sm:ml-1" title="Remove task">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:gap-5 sm:p-5 md:grid-cols-2">
        <Field label="Task Title" required>
          <Input placeholder="Enter task title" value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label="Task Type" required>
          <Select value={draft.taskType} onChange={(e) => onChange({ taskType: e.target.value })}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Center" required>
          <Select
            value={draft.centerId}
            onChange={(e) => {
              const nextCenter = e.target.value;
              if (!nextCenter) {
                onChange({ centerId: "", assignees: [] });
                return;
              }
              const allowedIds = new Set(
                users
                  .filter((u) => {
                    const uid = userCenterIdRef(u);
                    return uid === String(nextCenter) || !uid;
                  })
                  .map((u) => u._id)
              );
              onChange({
                centerId: nextCenter,
                assignees: draft.assignees.filter((id) => allowedIds.has(id)),
              });
            }}
          >
            <option value="">Select center…</option>
            {centers.map((c) => (
              <option key={c._id} value={c._id}>
                {formatCenterName(c.name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Department" required>
          <Select value={draft.departmentId} onChange={(e) => onChange({ departmentId: e.target.value })}>
            <option value="">Select department…</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="md:col-span-2">
          <Field label="Description" required>
            <Textarea rows={3} placeholder="Enter task description" value={draft.description} onChange={(e) => onChange({ description: e.target.value })} />
          </Field>
        </div>

        <Field label="Assign To Users" required icon={<Users className="h-3.5 w-3.5 text-brand-500" />}>
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setAssigneeOpen((v) => {
                  const next = !v;
                  if (!next) setAssigneeSearch("");
                  return next;
                })
              }
              className="flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3.5 text-left text-sm shadow-sm hover:border-brand-300 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <span className={selectedNames.length ? "" : "text-zinc-400"}>
                {selectedNames.length ? selectedNames.join(", ") : "Select users..."}
              </span>
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            </button>
            {assigneeOpen && (
              <div className="absolute z-20 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                <div className="sticky top-0 z-10 mb-1.5 bg-white px-1 pb-1 dark:bg-zinc-900">
                  <Input
                    placeholder="Search users..."
                    value={assigneeSearch}
                    onChange={(e) => setAssigneeSearch(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                {!draft.centerId && (
                  <div className="p-3 text-xs text-zinc-500">Select a center above to see users for that center.</div>
                )}
                {draft.centerId && filteredUsers.map((u) => {
                  const checked = draft.assignees.includes(u._id);
                  const centerText = userCenterLabel(u, centers);
                  return (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => onToggleAssignee(u._id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 ${checked ? "bg-brand-50 dark:bg-brand-900/30" : ""}`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-brand-500 bg-brand-500 text-white" : "border-zinc-300"}`}>
                        {checked && <CheckCircle2 className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-zinc-800 dark:text-zinc-100">{u.name}</span>
                      <span className="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5 text-right">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{u.role}</span>
                        <span className="max-w-full truncate text-[10px] text-zinc-400" title={centerText}>
                          {centerText}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {draft.centerId && usersInSelectedCenter.length === 0 && users.length > 0 && (
                  <div className="p-3 text-xs text-zinc-400">No users in this center.</div>
                )}
                {users.length === 0 && <div className="p-3 text-xs text-zinc-400">No users available</div>}
                {draft.centerId && usersInSelectedCenter.length > 0 && filteredUsers.length === 0 && (
                  <div className="p-3 text-xs text-zinc-400">No matching users</div>
                )}
              </div>
            )}
          </div>
        </Field>

        <Field label="Priority" icon={<span className="flex h-3 w-3 items-center justify-center rounded-full border border-zinc-400 text-[9px]">!</span>}>
          <Select value={draft.priority} onChange={(e) => onChange({ priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </Select>
        </Field>

        <label className="md:col-span-2 inline-flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={draft.requiresApproval}
            onChange={(e) => onChange({ requiresApproval: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-300 text-brand-500 focus:ring-brand-300"
          />
          Requires Admin Approval
        </label>

        <div className="md:col-span-2">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">Date Configuration</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Due Date" required>
              <div className="relative">
                <Input type="date" value={draft.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} />
                <Calendar className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-zinc-400" />
              </div>
            </Field>
            <Field label="Due Time" required>
              <Input
                type="time"
                value={draft.dueTime}
                onChange={(e) => onChange({ dueTime: e.target.value })}
              />
            </Field>
            {isRecurring && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-2">
                <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900">
                  <input
                    type="checkbox"
                    checked={draft.forever}
                    onChange={(e) => onChange({ forever: e.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300 text-brand-500"
                  />
                  Forever
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900">
                  <input
                    type="checkbox"
                    checked={draft.includeSunday}
                    onChange={(e) => onChange({ includeSunday: e.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300 text-brand-500"
                  />
                  Include Sunday
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
          <VoiceRecorder
            previewUrl={draft.voicePreviewUrl}
            onChange={(blob, url) => onChange({ voiceBlob: blob, voicePreviewUrl: url })}
          />
          <AttachmentBox
            files={draft.attachments}
            onChange={(files) => onChange({ attachments: files })}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-700 dark:text-zinc-200">
        {icon}
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function VoiceRecorder({
  previewUrl,
  onChange,
}: {
  previewUrl: string | null;
  onChange: (blob: Blob | null, url: string | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        onChange(blob, url);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      setMediaRecorder(rec);
      setRecording(true);
    } catch {
      alert("Microphone access was denied.");
    }
  };

  const stop = () => {
    mediaRecorder?.stop();
    setRecording(false);
  };

  const clear = () => onChange(null, null);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300">
        <Mic className="h-3.5 w-3.5 text-brand-500" /> Voice Recording
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={recording ? stop : start}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition ${
            recording ? "bg-zinc-600" : "bg-rose-500 hover:bg-rose-600"
          }`}
        >
          <Mic className="h-3.5 w-3.5" /> {recording ? "Stop Recording" : "Start Recording"}
        </button>
        {previewUrl && (
          <>
            <audio src={previewUrl} controls className="h-8 flex-1" />
            <button type="button" onClick={clear} className="text-[11px] text-zinc-400 hover:text-rose-500">
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AttachmentBox({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300">
        <Paperclip className="h-3.5 w-3.5 text-brand-500" /> Task Attachments (Max 10MB per file)
      </div>
      <div className="flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700">
          <Paperclip className="h-3.5 w-3.5" /> Choose Files
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onChange([...files, ...Array.from(e.target.files || [])])}
          />
        </label>
        <span className="text-xs text-zinc-500">
          {files.length === 0 ? "No file chosen" : `${files.length} file${files.length > 1 ? "s" : ""} selected`}
        </span>
      </div>
      {files.length === 0 ? (
        <div className="mt-3 text-[11px] text-zinc-400">No attachments for this task</div>
      ) : (
        <ul className="mt-2 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg border border-zinc-100 px-2.5 py-1 dark:border-zinc-800">
              <span className="truncate">{f.name}</span>
              <button type="button" className="text-zinc-400 hover:text-rose-500" onClick={() => onChange(files.filter((_, idx) => idx !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
