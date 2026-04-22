"use client";

import { Badge, cadenceTone, priorityTone, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, assetUrl } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { isCeo } from "@/lib/roles";
import {
  CalendarDays,
  Download,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Mic,
  Paperclip,
  Repeat,
  User2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RejectTaskModal } from "./reject-task-modal";

type Attachment = { name: string; url: string; size?: number; mimeType?: string };
type TaskDetail = {
  _id: string;
  title: string;
  description?: string;
  taskType: string;
  status: string;
  priority: string;
  dueDate: string;
  recurrence?: { forever?: boolean; includeSunday?: boolean; weekOff?: string; endDate?: string | null };
  attachments?: Attachment[];
  voiceNoteUrl?: string;
  assignees?: { _id: string; name: string; email: string }[];
  createdBy?: { _id: string; name: string; email?: string };
  project?: { name?: string };
  requiresApproval?: boolean;
  approvalStatus?: string;
  rejectionRemarks?: string;
  rejectionMode?: string;
  createdAt?: string;
  completedAt?: string | null;
};

function fileIcon(mime = "", name = "") {
  const m = mime.toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return FileImage;
  if (m.startsWith("audio/") || ["mp3", "wav", "webm", "ogg", "m4a"].includes(ext)) return FileAudio;
  if (m.startsWith("video/") || ["mp4", "mov", "avi", "mkv"].includes(ext)) return FileVideo;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return FileArchive;
  return FileText;
}

function prettySize(n?: number) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function TaskDetailDrawer({
  taskId,
  open,
  onClose,
  onUpdated,
}: {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const { user: me } = useAuth();
  const isAdmin = isCeo(me?.role);

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    if (!taskId) return;
    setLoading(true);
    api<{ task: TaskDetail }>(`/tasks/${taskId}`)
      .then((d) => setTask(d.task))
      .catch(() => setTask(null))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    if (open && taskId) load();
    if (!open) {
      setTask(null);
      setRejectOpen(false);
    }
  }, [open, taskId, load]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const content = (
    <div style={{ position: "fixed", inset: 0, zIndex: 100 }} className="flex">
      <button
        type="button"
        aria-label="Close"
        className="flex-1 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <aside
        style={{ height: "100vh" }}
        className="ml-auto flex w-full max-w-[560px] flex-col overflow-hidden bg-white shadow-2xl animate-pop-in dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-zinc-400">Task detail</div>
            <div className="mt-1 truncate text-lg font-bold">{task?.title || (loading ? "Loading…" : "—")}</div>
            {task && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={cadenceTone(task.taskType)}>{task.taskType.replace("_", " ")}</Badge>
                <Badge tone={statusTone(task.status)}>{task.status.replace("_", " ")}</Badge>
                <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                {(task.status === "awaiting_approval" || task.approvalStatus === "pending") && (
                  <Badge tone="violet" pulse>
                    Waiting for approval
                  </Badge>
                )}
                {task.requiresApproval && task.status !== "awaiting_approval" && task.approvalStatus !== "pending" && (
                  <Badge tone="brand">Needs approval</Badge>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {task?.description && (
            <section>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-zinc-400">Description</div>
              <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">{task.description}</p>
            </section>
          )}

          <section className="grid grid-cols-2 gap-3 text-xs">
            <InfoCard
              icon={CalendarDays}
              label={task && task.taskType !== "one_time" ? "Next due" : "Due date"}
              value={task ? new Date(task.dueDate).toLocaleString() : ""}
              sub={task && task.taskType !== "one_time" ? "advances when completed" : undefined}
            />
            <InfoCard
              icon={User2}
              label="Assigned by"
              value={task?.createdBy?.name || "—"}
              sub={task?.createdBy?.email}
            />
            <InfoCard
              icon={User2}
              label="Assigned to"
              value={task?.assignees?.map((a) => a.name).join(", ") || "Unassigned"}
              sub={task?.assignees?.map((a) => a.email).join(", ")}
            />
            <InfoCard
              icon={Repeat}
              label="Recurrence"
              value={
                task?.taskType === "one_time"
                  ? "One-time"
                  : `${task?.taskType || ""}${task?.recurrence?.forever ? " · forever" : task?.recurrence?.endDate ? ` · until ${new Date(task.recurrence.endDate).toLocaleDateString()}` : ""}`
              }
              sub={task?.taskType !== "one_time" ? `Week off: ${task?.recurrence?.weekOff || "Sunday"}` : undefined}
            />
          </section>

          {task && task.taskType !== "one_time" && (
            <section className="rounded-2xl border border-brand-200/70 bg-brand-50/40 p-4 text-[12px] text-brand-900 dark:border-brand-900/40 dark:bg-brand-900/15 dark:text-brand-100">
              <div className="flex items-center gap-2 font-semibold">
                <Repeat className="h-4 w-4" /> How this recurring task works
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[11.5px] text-zinc-700 dark:text-zinc-200">
                <li>
                  Cadence is <b>{task.taskType}</b>
                  {task.recurrence?.forever ? " and runs forever." : task.recurrence?.endDate ? ` until ${new Date(task.recurrence.endDate).toLocaleDateString()}.` : "."}
                </li>
                <li>Current occurrence is due <b>{new Date(task.dueDate).toLocaleDateString()}</b>.</li>
                <li>When marked completed, the due date automatically advances to the next occurrence.</li>
                {task.taskType === "daily" && (
                  <li>
                    {task.recurrence?.includeSunday ? "Runs every day including Sunday." : `Skips ${task.recurrence?.weekOff || "Sunday"} (week off).`}
                  </li>
                )}
              </ul>
            </section>
          )}

          {task?.voiceNoteUrl && (
            <section>
              <div className="mb-2 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                <Mic className="h-3 w-3 text-brand-500" /> Voice note
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-brand-200/80 bg-brand-50/60 p-3 dark:border-brand-900/40 dark:bg-brand-900/20">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white shadow-brand">
                  <FileAudio className="h-4 w-4" />
                </div>
                <audio src={assetUrl(task.voiceNoteUrl)} controls className="h-9 flex-1" />
                <a
                  href={assetUrl(task.voiceNoteUrl)}
                  download
                  className="flex h-9 w-9 items-center justify-center rounded-full text-brand-600 hover:bg-white dark:hover:bg-zinc-900"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
              <Paperclip className="h-3 w-3 text-brand-500" /> Attachments
              <span className="text-zinc-400">({task?.attachments?.length || 0})</span>
            </div>
            {task && task.attachments && task.attachments.length > 0 ? (
              <ul className="space-y-2">
                {task.attachments.map((a, i) => {
                  const Icon = fileIcon(a.mimeType, a.name);
                  const href = assetUrl(a.url);
                  const isImage = (a.mimeType || "").startsWith("image/");
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition hover:border-brand-300 hover:shadow-soft dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      {isImage ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-12 w-12 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={href} alt={a.name} className="h-full w-full object-cover" />
                        </a>
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-gradient-soft text-brand-600">
                          <Icon className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{a.name}</div>
                        <div className="text-[11px] text-zinc-500">
                          {a.mimeType || "file"} · {prettySize(a.size)}
                        </div>
                      </div>
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-brand-600 hover:underline"
                      >
                        View
                      </a>
                      <a
                        href={href}
                        download
                        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-brand-600 dark:hover:bg-zinc-800"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
                No attachments on this task.
              </div>
            )}
          </section>
        </div>

        {task && task.status !== "completed" && (
          <div className="space-y-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
            {task.status === "cancelled" ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200">
                <strong className="text-zinc-900 dark:text-zinc-100">This task was permanently closed.</strong>
                {task.rejectionRemarks ? (
                  <p className="mt-2 whitespace-pre-wrap text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">Reason: </span>
                    {task.rejectionRemarks}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                {(task.status === "awaiting_approval" || task.approvalStatus === "pending") && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2.5 text-xs text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-100">
                    <strong>Waiting for CEO approval.</strong> The CEO must approve before this task is marked completed
                    {task.taskType !== "one_time" ? " and the next occurrence is scheduled" : ""}.
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-zinc-500">
                    Created {task.createdAt ? new Date(task.createdAt).toLocaleString() : "—"}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {task.status === "awaiting_approval" || task.approvalStatus === "pending" ? (
                      isAdmin ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="gradient"
                            onClick={async () => {
                              await api(`/tasks/${task._id}/approve`, { method: "POST" });
                              onUpdated?.();
                              load();
                            }}
                          >
                            Approve & complete
                          </Button>
                        </>
                      ) : null
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await api(`/tasks/${task._id}`, { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) });
                            onUpdated?.();
                            load();
                          }}
                        >
                          Mark in progress
                        </Button>
                        <Button
                          size="sm"
                          variant="gradient"
                          onClick={async () => {
                            await api(`/tasks/${task._id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
                            onUpdated?.();
                            load();
                          }}
                        >
                          {isAdmin ? "Mark completed" : "Submit for approval"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );

  return (
    <>
      {createPortal(content, document.body)}
      <RejectTaskModal
        open={rejectOpen && !!task}
        taskId={task?._id ?? null}
        taskTitle={task?.title ?? ""}
        onClose={() => setRejectOpen(false)}
        onSuccess={() => {
          setRejectOpen(false);
          onUpdated?.();
          load();
        }}
      />
    </>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        <Icon className="h-3 w-3 text-brand-500" /> {label}
      </div>
      <div className="mt-1 truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">{value || "—"}</div>
      {sub && <div className="truncate text-[10.5px] text-zinc-500">{sub}</div>}
    </div>
  );
}
