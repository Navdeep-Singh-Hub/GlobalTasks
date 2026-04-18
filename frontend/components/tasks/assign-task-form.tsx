"use client";

import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api, ApiError, API_ORIGIN, getToken } from "@/lib/api";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Download,
  Mic,
  Paperclip,
  Plus,
  RotateCcw,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type UserLite = { _id: string; name: string; email: string; role: string };

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
  forever: boolean;
  includeSunday: boolean;
  weekOff: string;
  attachments: File[];
  voiceBlob: Blob | null;
  voicePreviewUrl: string | null;
};

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
    forever: true,
    includeSunday: false,
    weekOff: "Sunday",
    attachments: [],
    voiceBlob: null,
    voicePreviewUrl: null,
  };
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
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft(1)]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<{ users: UserLite[] }>("/users").then((d) => setUsers(d.users)).catch(() => setUsers([]));
  }, []);

  const createdCount = drafts.length;

  const addDraft = () => setDrafts((d) => [...d, emptyDraft(d.length + 1)]);
  const resetAll = () => setDrafts([emptyDraft(1)]);
  const updateDraft = (id: number, patch: Partial<Draft>) => setDrafts((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const submit = async () => {
    const invalid = drafts.find((d) => !d.title.trim() || !d.dueDate || d.assignees.length === 0);
    if (invalid) {
      setMessage({ type: "error", text: `Task #${invalid.id}: title, due date and at least one assignee are required.` });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      for (const d of drafts) {
        const [attachments, voiceNoteUrl] = await Promise.all([
          uploadAttachments(d.attachments),
          d.voiceBlob ? uploadVoice(d.voiceBlob) : Promise.resolve(""),
        ]);
        await api("/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: d.title.trim(),
            description: d.description,
            taskType: d.taskType,
            priority: d.priority,
            assignees: d.assignees,
            requiresApproval: d.requiresApproval,
            dueDate: new Date(d.dueDate).toISOString(),
            recurrence: {
              forever: d.forever,
              includeSunday: d.includeSunday,
              weekOff: d.weekOff,
            },
            attachments,
            voiceNoteUrl,
          }),
        });
      }
      setMessage({ type: "success", text: `Created ${drafts.length} task${drafts.length > 1 ? "s" : ""} successfully.` });
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
    <div className="space-y-5">
      {drafts.map((d, idx) => (
        <DraftCard
          key={d.id}
          index={idx + 1}
          draft={d}
          users={users}
          onChange={(patch) => updateDraft(d.id, patch)}
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <Button variant="outline" onClick={resetAll} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Reset All
        </Button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addDraft}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow hover:bg-emerald-600"
            aria-label="Add task"
          >
            <Plus className="h-5 w-5" />
          </button>
          <Button variant="gradient" onClick={submit} disabled={submitting} className="gap-2">
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
  onChange,
  onRemove,
}: {
  index: number;
  draft: Draft;
  users: UserLite[];
  onChange: (p: Partial<Draft>) => void;
  onRemove?: () => void;
}) {
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const selectedNames = useMemo(
    () => users.filter((u) => draft.assignees.includes(u._id)).map((u) => u.name),
    [users, draft.assignees]
  );

  const isRecurring = draft.taskType !== "one_time";
  const typeLabel = TYPES.find((t) => t.value === draft.taskType)?.label || "One Time";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Template</Button>
          <Button variant="gradient" size="sm" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Upload Template</Button>
          {onRemove && (
            <button onClick={onRemove} className="text-xs text-zinc-400 hover:text-rose-500" title="Remove task">×</button>
          )}
        </div>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-2">
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

        <div className="md:col-span-2">
          <Field label="Description">
            <Textarea rows={3} placeholder="Enter task description" value={draft.description} onChange={(e) => onChange({ description: e.target.value })} />
          </Field>
        </div>

        <Field label="Assign To Users" required icon={<Users className="h-3.5 w-3.5 text-brand-500" />}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setAssigneeOpen((v) => !v)}
              className="flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3.5 text-left text-sm shadow-sm hover:border-brand-300 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <span className={selectedNames.length ? "" : "text-zinc-400"}>
                {selectedNames.length ? selectedNames.join(", ") : "Select users..."}
              </span>
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            </button>
            {assigneeOpen && (
              <div className="absolute z-20 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                {users.map((u) => {
                  const checked = draft.assignees.includes(u._id);
                  return (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => onChange({ assignees: checked ? draft.assignees.filter((id) => id !== u._id) : [...draft.assignees, u._id] })}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 ${checked ? "bg-brand-50 dark:bg-brand-900/30" : ""}`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-brand-500 bg-brand-500 text-white" : "border-zinc-300"}`}>
                        {checked && <CheckCircle2 className="h-3 w-3" />}
                      </span>
                      <span className="flex-1">{u.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-400">{u.role}</span>
                    </button>
                  );
                })}
                {users.length === 0 && <div className="p-3 text-xs text-zinc-400">No users available</div>}
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
            {isRecurring && (
              <div className="grid grid-cols-2 gap-3">
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
