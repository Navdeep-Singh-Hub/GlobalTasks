"use client";

import { Badge, cadenceTone, priorityTone, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/ui/motion-button";
import { Textarea } from "@/components/ui/input";
import { formatAppDate, formatAppDateTime } from "@/lib/date-format";
import { api, ApiError, assetUrl } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useCelebration } from "@/contexts/celebration-context";
import { isCeo, isManagement } from "@/lib/roles";
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
import { useCallback, useEffect, useRef, useState } from "react";
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
  assignedBy?: { _id: string; name: string; email?: string };
  createdBy?: { _id: string; name: string; email?: string };
  project?: { name?: string };
  requiresApproval?: boolean;
  approvalStatus?: string;
  rejectionRemarks?: string;
  rejectionMode?: string;
  submissionRemarks?: string;
  personalWorkState?: "open" | "submitted" | "viewer";
  canSubmitForApproval?: boolean;
  personalPendingKind?: string;
  sharedTaskAwaitingOthers?: boolean;
  notDoneApproval?: {
    dueDate?: string;
    remarks?: string;
    status?: string;
  };
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
  onRequestEdit,
  onSendBackForApproval,
  onBehalfAssigneeId,
}: {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onRequestEdit?: (taskId: string) => void;
  onSendBackForApproval?: (taskId: string, occurrenceDueDate?: string) => void | Promise<void>;
  onBehalfAssigneeId?: string;
}) {
  const { user: me } = useAuth();
  const { celebrate } = useCelebration();
  const myId = onBehalfAssigneeId || (me?._id ? String(me._id) : "");
  const isCeoUser = isCeo(me?.role) && !onBehalfAssigneeId;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [submissionRemarksDraft, setSubmissionRemarksDraft] = useState("");
  const [submitErr, setSubmitErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const remarksRef = useRef<HTMLTextAreaElement>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const scrollToSubmitSection = useCallback(() => {
    const run = () => actionsRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    run();
    window.setTimeout(run, 350);
  }, []);

  const assignerId = task ? String(task.assignedBy?._id || task.createdBy?._id || "") : "";
  const canApprove = Boolean(task && myId && (isCeoUser || assignerId === myId));
  const canEditAsAssigner = Boolean(
    task && myId && assignerId === myId && (isCeoUser || isManagement(me?.role))
  );
  const hasPendingNotDone = task?.notDoneApproval?.status === "pending";
  const isAssignee = Boolean(
    task &&
      myId &&
      task.assignees?.some((a) => String((a as { _id?: string })?._id || a) === String(myId))
  );
  const canResubmit = Boolean(
    task &&
      task.taskType === "daily" &&
      !hasPendingNotDone &&
      ((task.status === "awaiting_approval" && task.approvalStatus === "pending") ||
        (task.status === "completed" && task.approvalStatus === "approved")) &&
      (isAssignee || canEditAsAssigner)
  );
  const isTerminalStatus = task?.status === "completed" || task?.status === "cancelled";
  const showFooter = Boolean(task && (!isTerminalStatus || canEditAsAssigner || (isAssignee && canResubmit)));
  const canSendBackForApproval = Boolean(
    canEditAsAssigner &&
      task &&
      (task.status === "completed" ||
        task.status === "cancelled" ||
        task.approvalStatus === "approved")
  );
  const isRecurringTask = Boolean(task && task.taskType !== "one_time");
  // Only hide Submit when THIS person has a pending submission in history.
  // Never treat missing personalWorkState or shared awaiting_approval as "already submitted".
  const personalSubmitted = task?.personalWorkState === "submitted";
  // Sticky not-done on task without personal submit still blocks submit on one-time until cleared;
  // personalWork API unstucks solo tasks, and personalSubmitted covers real not_done submits.
  const blockedByStickyNotDone =
    Boolean(hasPendingNotDone) && !personalSubmitted && !isRecurringTask && task?.personalWorkState !== "open";
  // Hide only when API says false (already submitted) or local personalSubmitted / sticky blocks.
  const canSubmitForApproval = Boolean(
    task &&
      myId &&
      !isCeoUser &&
      isAssignee &&
      !personalSubmitted &&
      task.canSubmitForApproval !== false &&
      !blockedByStickyNotDone &&
      task.status !== "completed" &&
      task.status !== "cancelled"
  );
  const canMarkNotDone = Boolean(
    task &&
      myId &&
      !isCeoUser &&
      isAssignee &&
      !personalSubmitted &&
      !hasPendingNotDone &&
      task.status !== "completed" &&
      task.status !== "cancelled"
  );
  const canApproveNotDone = Boolean(canApprove && hasPendingNotDone);
  // Assigner: approve / acknowledge whenever the task is waiting (not exclusive vs submit).
  const showAssignerApprovalActions = Boolean(
    canApprove &&
      (personalSubmitted ||
        hasPendingNotDone ||
        task?.status === "awaiting_approval" ||
        task?.approvalStatus === "pending")
  );
  // Banner for the person who submitted, or for assigner reviewing a waiting task.
  const showWaitingForApprovalBanner = Boolean(
    personalSubmitted ||
      (canApprove &&
        (hasPendingNotDone ||
          task?.status === "awaiting_approval" ||
          task?.approvalStatus === "pending"))
  );

  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    if (!taskId) return;
    setLoading(true);
    setLoadError("");
    const qs = onBehalfAssigneeId ? `?onBehalfAssigneeId=${encodeURIComponent(onBehalfAssigneeId)}` : "";
    api<{ task: TaskDetail }>(`/tasks/${taskId}${qs}`)
      .then((d) => setTask(d.task))
      .catch((e) => {
        setTask(null);
        setLoadError(e instanceof ApiError ? e.message : "Could not load task details.");
      })
      .finally(() => setLoading(false));
  }, [taskId, onBehalfAssigneeId]);

  useEffect(() => {
    if (open && taskId) load();
    if (!open) {
      setTask(null);
      setLoadError("");
      setRejectOpen(false);
      setSubmissionRemarksDraft("");
      setSubmitErr("");
      setSubmitting(false);
      setSubmitSuccess(false);
    }
  }, [open, taskId, load]);

  const markNotDone = async () => {
    if (!task) return;
    const text = submissionRemarksDraft.trim();
    if (!text) {
      setSubmitErr("Please add remarks explaining why this was not done.");
      scrollToSubmitSection();
      return;
    }
    setSubmitErr("");
    setSubmitting(true);
    try {
      await api(`/tasks/${task._id}/not-done`, {
        method: "POST",
        body: JSON.stringify({ submissionRemarks: text }),
      });
      celebrate("not_done");
      onUpdated?.();
      load();
      setSubmissionRemarksDraft("");
    } catch (e) {
      setSubmitErr(e instanceof ApiError ? e.message : "Could not mark as not done.");
    } finally {
      setSubmitting(false);
    }
  };

  const resubmitTask = async () => {
    if (!task) return;
    setResubmitting(true);
    try {
      await api(`/tasks/${task._id}/resubmit`, { method: "POST" });
      onUpdated?.();
      load();
      setSubmissionRemarksDraft("");
    } catch (e) {
      setSubmitErr(e instanceof ApiError ? e.message : "Could not resubmit task.");
    } finally {
      setResubmitting(false);
    }
  };

  const submitForApproval = async () => {
    if (!task) return;
    const text = submissionRemarksDraft.trim();
    if (!text) {
      setSubmitErr("Please add remarks before submitting for approval.");
      scrollToSubmitSection();
      return;
    }
    setSubmitErr("");
    setSubmitting(true);
    try {
      await api(`/tasks/${task._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "completed",
          submissionRemarks: text,
          ...(onBehalfAssigneeId ? { onBehalfAssigneeId } : {}),
        }),
      });
      setSubmitSuccess(true);
      setSubmissionRemarksDraft("");
      onUpdated?.();
      await load();
      onClose();
      window.requestAnimationFrame(() => celebrate(isCeoUser ? "complete" : "submit"));
      window.setTimeout(() => setSubmitSuccess(false), 2400);
    } catch (e) {
      setSubmitErr(e instanceof ApiError ? e.message : "Could not submit for approval.");
    } finally {
      setSubmitting(false);
    }
  };

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

  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const syncKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset > 80 ? inset : 0);
    };
    syncKeyboardInset();
    vv.addEventListener("resize", syncKeyboardInset);
    vv.addEventListener("scroll", syncKeyboardInset);
    return () => {
      vv.removeEventListener("resize", syncKeyboardInset);
      vv.removeEventListener("scroll", syncKeyboardInset);
      setKeyboardInset(0);
    };
  }, [open]);

  useEffect(() => {
    if (submitErr) scrollToSubmitSection();
  }, [submitErr, scrollToSubmitSection]);

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
        className={`ml-auto flex h-[100dvh] max-h-[100dvh] w-full max-w-[560px] flex-col overflow-hidden border-l border-white/20 bg-white/95 shadow-elevated backdrop-blur-xl animate-slide-in-right transition-all duration-500 dark:border-zinc-800 dark:bg-zinc-950/95 ${
          submitSuccess ? "ring-4 ring-emerald-400/70 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950" : ""
        }`}
      >
        <div className="relative flex items-start justify-between gap-3 border-b border-zinc-100/80 bg-gradient-to-r from-brand-50/50 to-transparent p-5 dark:border-zinc-800 dark:from-brand-950/30">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-gradient-soft blur-2xl" aria-hidden />
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

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: keyboardInset ? `${keyboardInset}px` : undefined }}
        >
          <div className="space-y-5 p-5">
          {loadError && !loading && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
              {loadError}
            </p>
          )}
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
              value={task ? formatAppDateTime(task.dueDate) : ""}
              sub={task && task.taskType !== "one_time" ? "advances when completed" : undefined}
            />
            <InfoCard
              icon={User2}
              label="Assigned by"
              value={task?.assignedBy?.name || task?.createdBy?.name || "—"}
              sub={task?.assignedBy?.email || task?.createdBy?.email}
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
                  : `${task?.taskType || ""}${task?.recurrence?.forever ? " · forever" : task?.recurrence?.endDate ? ` · until ${formatAppDate(task.recurrence.endDate)}` : ""}`
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
                  {task.recurrence?.forever ? " and runs forever." : task.recurrence?.endDate ? ` until ${formatAppDate(task.recurrence.endDate)}.` : "."}
                </li>
                <li>Current occurrence is due <b>{formatAppDate(task.dueDate)}</b>.</li>
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

        {task && showFooter && (
          <div className="space-y-3 border-t border-zinc-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-950">
            {isTerminalStatus && canEditAsAssigner ? (
              <>
                {task.status === "cancelled" ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200">
                    <strong className="text-zinc-900 dark:text-zinc-100">This task was rejected and closed.</strong>
                    {task.rejectionRemarks ? (
                      <p className="mt-2 whitespace-pre-wrap text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">Reason: </span>
                        {task.rejectionRemarks}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2.5 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
                    <strong>Task completed.</strong> Use <strong>Send back to For Approval</strong> to unapprove and
                    review again, or <strong>Edit</strong> to change details.
                  </div>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="text-[11px] text-zinc-500">
                    Created {task.createdAt ? formatAppDateTime(task.createdAt) : "—"}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    {canResubmit ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={resubmitting}
                        onClick={() => void resubmitTask()}
                      >
                        {resubmitting ? "Resubmitting…" : "Resubmit to assignee"}
                      </Button>
                    ) : null}
                    {canSendBackForApproval && onSendBackForApproval ? (
                      <Button
                        size="sm"
                        variant="gradient"
                        className="w-full sm:w-auto"
                        disabled={sendingBack}
                        onClick={async () => {
                          setSendingBack(true);
                          try {
                            await onSendBackForApproval(task._id);
                            onUpdated?.();
                            load();
                          } finally {
                            setSendingBack(false);
                          }
                        }}
                      >
                        {sendingBack ? "Sending…" : "Send back to For Approval"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => onRequestEdit?.(task._id)}
                    >
                      Edit task
                    </Button>
                  </div>
                </div>
              </>
            ) : task.status === "cancelled" ? (
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
                {showWaitingForApprovalBanner && (
                  <div className="space-y-2">
                    <div className="rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2.5 text-xs text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-100">
                      {hasPendingNotDone && (personalSubmitted || canApprove) ? (
                        <>
                          <strong>Not done — waiting for assigner.</strong> An assignee reported this occurrence as not done
                          {task.notDoneApproval?.dueDate
                            ? ` (due ${formatAppDate(task.notDoneApproval.dueDate)})`
                            : ""}
                          .
                          {task.taskType !== "one_time" ? " The task has moved to the next due date for the assignee." : ""}
                        </>
                      ) : (
                        <>
                          <strong>Waiting for approval.</strong>{" "}
                          {personalSubmitted
                            ? "Your submit is with the person who assigned this task."
                            : "A submission is waiting for review."}
                          {task.taskType !== "one_time" ? " After approve, the next occurrence is scheduled." : ""}
                          {canResubmit && isAssignee && personalSubmitted ? (
                            <span className="mt-1 block">
                              Use <strong>Resubmit</strong> below to withdraw this submission and redo today&apos;s work.
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                    {(personalSubmitted || (canApprove && task.submissionRemarks)) && task.submissionRemarks ? (
                      <div className="rounded-xl border border-brand-200 bg-brand-50/80 px-3 py-2.5 text-xs text-brand-950 dark:border-brand-900/50 dark:bg-brand-950/40 dark:text-brand-100">
                        <span className="font-semibold">Submission remarks: </span>
                        <span className="whitespace-pre-wrap">{task.submissionRemarks}</span>
                      </div>
                    ) : null}
                  </div>
                )}
                {(canSubmitForApproval || canMarkNotDone) ? (
                  <label className="block">
                    <span className="text-xs font-semibold text-zinc-500">Remarks *</span>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      Required for <strong>Submit for approval</strong> or <strong>Not done</strong>. Your assigner will see this in For Approval.
                    </p>
                    <Textarea
                      ref={remarksRef}
                      value={submissionRemarksDraft}
                      onChange={(e) => {
                        setSubmissionRemarksDraft(e.target.value);
                        if (submitErr) setSubmitErr("");
                      }}
                      onFocus={scrollToSubmitSection}
                      rows={3}
                      placeholder="What was completed, notes for reviewer…"
                      className="mt-2"
                    />
                    {submitErr ? <p className="mt-1.5 text-xs font-semibold text-rose-600">{submitErr}</p> : null}
                    {submitSuccess ? (
                      <p className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 animate-fade-in-up dark:bg-emerald-950/40 dark:text-emerald-200">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success-gradient text-white">✓</span>
                        Submitted — waiting for assigner approval
                      </p>
                    ) : null}
                  </label>
                ) : null}
                <div ref={actionsRef} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="text-[11px] text-zinc-500">
                    Created {task.createdAt ? formatAppDateTime(task.createdAt) : "—"}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    {showAssignerApprovalActions ? (
                      <>
                        {!canApproveNotDone && (
                          <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
                            Reject
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="gradient"
                          className="w-full sm:w-auto"
                          onClick={async () => {
                            await api(`/tasks/${task._id}/approve`, { method: "POST" });
                            celebrate("approve");
                            onUpdated?.();
                            load();
                          }}
                        >
                          {canApproveNotDone ? "Acknowledge not done" : "Approve & complete"}
                        </Button>
                      </>
                    ) : null}
                    {canResubmit && (canEditAsAssigner || (isAssignee && personalSubmitted)) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={resubmitting}
                        onClick={() => void resubmitTask()}
                      >
                        {resubmitting ? "Resubmitting…" : "Resubmit"}
                      </Button>
                    ) : null}
                    {canMarkNotDone && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={submitting}
                        onClick={() => void markNotDone()}
                      >
                        {submitting ? "Saving…" : "Not done"}
                      </Button>
                    )}
                    {isCeoUser && isAssignee && !personalSubmitted && task.status !== "completed" ? (
                      <Button
                        size="sm"
                        variant="gradient"
                        className="w-full sm:w-auto"
                        onClick={async () => {
                          await api(`/tasks/${task._id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
                          onUpdated?.();
                          load();
                        }}
                      >
                        Mark completed
                      </Button>
                    ) : null}
                    {canSubmitForApproval ? (
                      <MotionButton
                        size="sm"
                        variant="gradient"
                        className="w-full sm:w-auto"
                        loading={submitting}
                        success={submitSuccess}
                        disabled={submitting}
                        onClick={() => void submitForApproval()}
                      >
                        Submit for approval
                      </MotionButton>
                    ) : null}
                    {canEditAsAssigner && onRequestEdit ? (
                      <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => onRequestEdit(task._id)}>
                        Edit
                      </Button>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        </div>
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
