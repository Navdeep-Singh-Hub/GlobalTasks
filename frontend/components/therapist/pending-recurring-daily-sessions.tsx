"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { ClipboardCheck, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

type SessionRow = {
  id: string;
  patientName: string;
  durationMinutes: string;
  startedAt: string;
  videoUploaded: boolean;
};

type UploadedSession = {
  _id: string;
  sessionDate: string;
  patientName: string;
  startedAt?: string;
  durationMinutes?: number;
  videoUploaded?: boolean;
  createdAt?: string;
  createdBy?: string;
  therapistId?: { _id: string; name: string } | null;
};

type EditDraft = {
  sessionDate: string;
  patientName: string;
  startedAt: string;
  durationMinutes: string;
  videoUploaded: boolean;
};

type SupervisorSheetTask = {
  key: string;
  task: string;
};

const OBSERVE_THERAPY_TASK_KEY = "observe-therapy-sessions";
const ALTERNATIVE_SESSION_TASK_KEY = "alternative-session";
const THERAPY_PLAN_CHECK_TASK_KEY = "therapy-plan-check";

type TherapyPlanRow = {
  id: string;
  name: string;
  time: string;
  roomNo: string;
  child: string;
  activity: string;
};

const SUPERVISOR_SHEET_TASKS: SupervisorSheetTask[] = [
  { key: "observe-therapy-sessions", task: "Observe therapy sessions" },
  { key: "supervisor-round-notes", task: "Therapy plan check" },
  { key: "therapy-plan-check", task: "Supervisor round notes complete" },
  { key: "ensure-therapy-notes-complete", task: "Ensure therapy notes are complete" },
  { key: "team-utilized-free-session", task: "How team utilized free session of therapist" },
  { key: "alternative-session", task: "Alternative session" },
];

function newTherapyPlanRow(): TherapyPlanRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: "",
    time: "",
    roomNo: "",
    child: "",
    activity: "",
  };
}

function parseStructuredTaskPayload(raw: string) {
  const fallback = {
    remarks: raw || "",
    therapistName: "",
    patientName: "",
    dateFrom: "",
    dateTo: "",
    therapyPlanRows: [] as TherapyPlanRow[],
  };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as {
      remarks?: string;
      therapistName?: string;
      patientName?: string;
      dateFrom?: string;
      dateTo?: string;
      therapyPlanRows?: { name?: string; time?: string; roomNo?: string; child?: string; activity?: string }[];
    };
    if (!parsed || typeof parsed !== "object") return fallback;
    const parsedRows = Array.isArray(parsed.therapyPlanRows)
      ? parsed.therapyPlanRows.map((r) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: String(r?.name || ""),
          time: String(r?.time || ""),
          roomNo: String(r?.roomNo || ""),
          child: String(r?.child || ""),
          activity: String(r?.activity || ""),
        }))
      : [];
    return {
      remarks: String(parsed.remarks || ""),
      therapistName: String(parsed.therapistName || ""),
      patientName: String(parsed.patientName || ""),
      dateFrom: String(parsed.dateFrom || ""),
      dateTo: String(parsed.dateTo || ""),
      therapyPlanRows: parsedRows,
    };
  } catch {
    return fallback;
  }
}

function supportsSessionNames(taskKey: string) {
  return taskKey === OBSERVE_THERAPY_TASK_KEY || taskKey === ALTERNATIVE_SESSION_TASK_KEY;
}

function supportsTherapyPlanRows(taskKey: string) {
  return taskKey === THERAPY_PLAN_CHECK_TASK_KEY;
}

function supportsDateRange() {
  return false;
}

function dateInIST(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function newRow(): SessionRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    patientName: "",
    durationMinutes: "30",
    startedAt: "",
    videoUploaded: false,
  };
}

export function PendingRecurringDailySessions() {
  const { user } = useAuth();
  const isSupervisor = user?.role === "supervisor";
  const [sessionDate, setSessionDate] = useState(todayIsoDate);
  const [rows, setRows] = useState<SessionRow[]>(() => [newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [uploadedSessions, setUploadedSessions] = useState<UploadedSession[]>([]);
  const [loadingUploaded, setLoadingUploaded] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [viewFrom, setViewFrom] = useState(todayIsoDate);
  const [viewTo, setViewTo] = useState(todayIsoDate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [sheetStatusByTask, setSheetStatusByTask] = useState<Record<string, "yes" | "no">>({});
  const [sheetRemarksByTask, setSheetRemarksByTask] = useState<Record<string, string>>({});
  const [sheetTherapistNameByTask, setSheetTherapistNameByTask] = useState<Record<string, string>>({});
  const [sheetPatientNameByTask, setSheetPatientNameByTask] = useState<Record<string, string>>({});
  const [sheetDateFromByTask, setSheetDateFromByTask] = useState<Record<string, string>>({});
  const [sheetDateToByTask, setSheetDateToByTask] = useState<Record<string, string>>({});
  const [sheetTherapyPlanRowsByTask, setSheetTherapyPlanRowsByTask] = useState<Record<string, TherapyPlanRow[]>>({});
  const [expandedTaskKeys, setExpandedTaskKeys] = useState<Record<string, boolean>>({});
  const [savingSheet, setSavingSheet] = useState(false);
  const [showSupervisorSheet, setShowSupervisorSheet] = useState(false);
  const [supervisorSheetInstances, setSupervisorSheetInstances] = useState<{ instanceKey: string; label: string }[]>([]);
  const [pendingSupervisorSheetKeys, setPendingSupervisorSheetKeys] = useState<string[]>([]);
  const [activeSupervisorSheetKey, setActiveSupervisorSheetKey] = useState("default");
  const [supervisorSheetLabelDraft, setSupervisorSheetLabelDraft] = useState("");
  const [supervisorSheetViewOnly, setSupervisorSheetViewOnly] = useState(false);
  const [supervisorSheetReloadNonce, setSupervisorSheetReloadNonce] = useState(0);

  useEffect(() => {
    setSupervisorSheetViewOnly(false);
  }, [sessionDate]);

  useEffect(() => {
    if (!user) return;
    const qs = new URLSearchParams();
    qs.set("limit", "100");
    if (viewFrom) qs.set("from", viewFrom);
    if (viewTo) qs.set("to", viewTo);
    if (isSupervisor) qs.set("scope", "self");
    setLoadingUploaded(true);
    api<{ sessions: UploadedSession[]; total?: number }>(`/reports/therapist-sessions?${qs.toString()}`)
      .then((d) => setUploadedSessions(Array.isArray(d.sessions) ? d.sessions : []))
      .catch(() => setUploadedSessions([]))
      .finally(() => setLoadingUploaded(false));
  }, [user, isSupervisor, viewFrom, viewTo, refreshToken]);

  const addRow = useCallback(() => setRows((r) => [...r, newRow()]), []);
  const removeRow = useCallback((id: string) => {
    setRows((r) => (r.length <= 1 ? r : r.filter((x) => x.id !== id)));
  }, []);
  const patchRow = useCallback((id: string, patch: Partial<SessionRow>) => {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const submit = async () => {
    const filled = rows.filter((r) => r.patientName.trim());
    if (!filled.length) {
      setMessage({ type: "err", text: "Add at least one session with a patient name." });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      for (const r of filled) {
        // eslint-disable-next-line no-await-in-loop
        await api("/reports/therapist-sessions", {
          method: "POST",
          body: JSON.stringify({
            sessionDate,
            patientName: r.patientName.trim(),
            startedAt: r.startedAt,
            durationMinutes: Number(r.durationMinutes) || 0,
            videoUploaded: r.videoUploaded,
            videoUrl: "",
          }),
        });
      }
      setRows([newRow()]);
      setSessionDate(todayIsoDate());
      setMessage({ type: "ok", text: `Saved ${filled.length} session(s).` });
      setRefreshToken((v) => v + 1);
    } catch (e) {
      setMessage({ type: "err", text: e instanceof ApiError ? e.message : "Could not save sessions." });
    } finally {
      setSubmitting(false);
    }
  };

  const refreshSupervisorSheetInstances = useCallback(async () => {
    if (!user?._id) return;
    const qs = new URLSearchParams();
    qs.set("sheetDate", sessionDate);
    qs.set("supervisorId", user._id);
    try {
      const d = await api<{ instances: { instanceKey: string; label: string }[] }>(`/reports/supervisor-sheet/instances?${qs.toString()}`);
      const inst = Array.isArray(d.instances) ? d.instances : [];
      setSupervisorSheetInstances(
        inst.map((x) => ({ instanceKey: String(x.instanceKey || "default"), label: String(x.label || "") }))
      );
    } catch {
      setSupervisorSheetInstances([]);
    }
  }, [sessionDate, user?._id]);

  const mergedSupervisorSheetTabs = useMemo(() => {
    const seen = new Set<string>();
    const out: { instanceKey: string; label: string }[] = [];
    for (const i of supervisorSheetInstances) {
      if (!seen.has(i.instanceKey)) {
        seen.add(i.instanceKey);
        out.push({ instanceKey: i.instanceKey, label: i.label });
      }
    }
    for (const key of pendingSupervisorSheetKeys) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ instanceKey: key, label: "" });
      }
    }
    out.sort((a, b) => {
      if (a.instanceKey === "default") return -1;
      if (b.instanceKey === "default") return 1;
      return a.instanceKey.localeCompare(b.instanceKey);
    });
    return out;
  }, [supervisorSheetInstances, pendingSupervisorSheetKeys]);

  useEffect(() => {
    if (!isSupervisor || !user?._id) return;
    setPendingSupervisorSheetKeys([]);
    void refreshSupervisorSheetInstances();
  }, [isSupervisor, sessionDate, user?._id, refreshSupervisorSheetInstances]);

  useEffect(() => {
    const keys = new Set(mergedSupervisorSheetTabs.map((t) => t.instanceKey));
    if (!keys.has(activeSupervisorSheetKey)) {
      setActiveSupervisorSheetKey(keys.has("default") ? "default" : mergedSupervisorSheetTabs[0]?.instanceKey ?? "default");
    }
  }, [mergedSupervisorSheetTabs, activeSupervisorSheetKey]);

  useEffect(() => {
    if (!isSupervisor || !user?._id) return;
    const qs = new URLSearchParams();
    qs.set("sheetDate", sessionDate);
    qs.set("supervisorId", user._id);
    qs.set("instanceKey", activeSupervisorSheetKey);
    api<{ entries: { taskKey: string; status?: string; remarks?: string }[]; label?: string }>(
      `/reports/supervisor-sheet?${qs.toString()}`
    )
      .then((d) => {
        const entries = Array.isArray(d.entries) ? d.entries : [];
        setSupervisorSheetLabelDraft(typeof d.label === "string" ? d.label : "");
        const nextStatus: Record<string, "yes" | "no"> = {};
        const nextRemarks: Record<string, string> = {};
        const nextTherapistNames: Record<string, string> = {};
        const nextPatientNames: Record<string, string> = {};
        const nextDateFrom: Record<string, string> = {};
        const nextDateTo: Record<string, string> = {};
        const nextTherapyPlanRows: Record<string, TherapyPlanRow[]> = {};
        for (const task of SUPERVISOR_SHEET_TASKS) {
          nextStatus[task.key] = "no";
          nextRemarks[task.key] = "";
          nextTherapistNames[task.key] = "";
          nextPatientNames[task.key] = "";
          nextDateFrom[task.key] = "";
          nextDateTo[task.key] = "";
          nextTherapyPlanRows[task.key] = supportsTherapyPlanRows(task.key) ? [newTherapyPlanRow()] : [];
        }
        for (const e of entries) {
          if (!e?.taskKey) continue;
          nextStatus[e.taskKey] = String(e.status || "").toLowerCase() === "yes" ? "yes" : "no";
          const rawRemarks = String(e.remarks || "");
          if (supportsSessionNames(e.taskKey) || supportsTherapyPlanRows(e.taskKey) || supportsDateRange()) {
            const parsed = parseStructuredTaskPayload(rawRemarks);
            nextRemarks[e.taskKey] = parsed.remarks;
            nextTherapistNames[e.taskKey] = parsed.therapistName;
            nextPatientNames[e.taskKey] = parsed.patientName;
            nextDateFrom[e.taskKey] = parsed.dateFrom;
            nextDateTo[e.taskKey] = parsed.dateTo;
            if (supportsTherapyPlanRows(e.taskKey)) {
              nextTherapyPlanRows[e.taskKey] = parsed.therapyPlanRows.length ? parsed.therapyPlanRows : [newTherapyPlanRow()];
            }
          } else {
            nextRemarks[e.taskKey] = rawRemarks;
          }
        }
        setSheetStatusByTask(nextStatus);
        setSheetRemarksByTask(nextRemarks);
        setSheetTherapistNameByTask(nextTherapistNames);
        setSheetPatientNameByTask(nextPatientNames);
        setSheetDateFromByTask(nextDateFrom);
        setSheetDateToByTask(nextDateTo);
        setSheetTherapyPlanRowsByTask(nextTherapyPlanRows);
      })
      .catch(() => {
        setSupervisorSheetLabelDraft("");
        const nextStatus: Record<string, "yes" | "no"> = {};
        const nextRemarks: Record<string, string> = {};
        const nextTherapistNames: Record<string, string> = {};
        const nextPatientNames: Record<string, string> = {};
        const nextDateFrom: Record<string, string> = {};
        const nextDateTo: Record<string, string> = {};
        const nextTherapyPlanRows: Record<string, TherapyPlanRow[]> = {};
        for (const task of SUPERVISOR_SHEET_TASKS) {
          nextStatus[task.key] = "no";
          nextRemarks[task.key] = "";
          nextTherapistNames[task.key] = "";
          nextPatientNames[task.key] = "";
          nextDateFrom[task.key] = "";
          nextDateTo[task.key] = "";
          nextTherapyPlanRows[task.key] = supportsTherapyPlanRows(task.key) ? [newTherapyPlanRow()] : [];
        }
        setSheetStatusByTask(nextStatus);
        setSheetRemarksByTask(nextRemarks);
        setSheetTherapistNameByTask(nextTherapistNames);
        setSheetPatientNameByTask(nextPatientNames);
        setSheetDateFromByTask(nextDateFrom);
        setSheetDateToByTask(nextDateTo);
        setSheetTherapyPlanRowsByTask(nextTherapyPlanRows);
      });
  }, [isSupervisor, sessionDate, user?._id, activeSupervisorSheetKey, supervisorSheetReloadNonce]);

  const saveSupervisorSheet = async () => {
    if (!isSupervisor || !user?._id) return;
    setSavingSheet(true);
    setMessage(null);
    try {
      const entries = SUPERVISOR_SHEET_TASKS.map((task) => ({
        taskKey: task.key,
        status: sheetStatusByTask[task.key] || "no",
        remarks:
          supportsSessionNames(task.key) || supportsTherapyPlanRows(task.key) || supportsDateRange()
            ? JSON.stringify({
                remarks: sheetRemarksByTask[task.key] || "",
                therapistName: sheetTherapistNameByTask[task.key] || "",
                patientName: sheetPatientNameByTask[task.key] || "",
                dateFrom: sheetDateFromByTask[task.key] || "",
                dateTo: sheetDateToByTask[task.key] || "",
                therapyPlanRows: (sheetTherapyPlanRowsByTask[task.key] || []).map((r) => ({
                  name: r.name,
                  time: r.time,
                  roomNo: r.roomNo,
                  child: r.child,
                  activity: r.activity,
                })),
              })
            : sheetRemarksByTask[task.key] || "",
      }));
      await api("/reports/supervisor-sheet", {
        method: "PUT",
        body: JSON.stringify({
          supervisorId: user._id,
          sheetDate: sessionDate,
          instanceKey: activeSupervisorSheetKey,
          label: supervisorSheetLabelDraft.trim(),
          entries,
        }),
      });
      setPendingSupervisorSheetKeys((prev) => prev.filter((k) => k !== activeSupervisorSheetKey));
      await refreshSupervisorSheetInstances();
      setSupervisorSheetViewOnly(true);
      setMessage({ type: "ok", text: "Supervisor sheet saved." });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof ApiError ? e.message : "Could not save supervisor sheet." });
    } finally {
      setSavingSheet(false);
    }
  };

  const addSupervisorSheetTab = () => {
    const key =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setPendingSupervisorSheetKeys((prev) => [...prev, key]);
    setActiveSupervisorSheetKey(key);
    setSupervisorSheetLabelDraft("");
  };

  const removeActiveSupervisorSheetTab = async () => {
    if (!user?._id || activeSupervisorSheetKey === "default") return;
    if (pendingSupervisorSheetKeys.includes(activeSupervisorSheetKey)) {
      setPendingSupervisorSheetKeys((prev) => prev.filter((k) => k !== activeSupervisorSheetKey));
      setActiveSupervisorSheetKey("default");
      return;
    }
    setMessage(null);
    try {
      const qs = new URLSearchParams();
      qs.set("supervisorId", user._id);
      qs.set("sheetDate", sessionDate);
      qs.set("instanceKey", activeSupervisorSheetKey);
      await api(`/reports/supervisor-sheet?${qs.toString()}`, { method: "DELETE" });
      setActiveSupervisorSheetKey("default");
      await refreshSupervisorSheetInstances();
      setMessage({ type: "ok", text: "Sheet removed." });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof ApiError ? e.message : "Could not remove sheet." });
    }
  };

  const svRo = supervisorSheetViewOnly;

  const canEditUploaded = useCallback(
    (s: UploadedSession) => {
      if (!user?._id) return false;
      if (String(s.createdBy || "") !== String(user._id)) return false;
      if (!s.createdAt) return false;
      return dateInIST(s.createdAt) === dateInIST(new Date());
    },
    [user?._id]
  );

  const beginEdit = (s: UploadedSession) => {
    setEditingId(s._id);
    setEditDraft({
      sessionDate: s.sessionDate || viewFrom || todayIsoDate(),
      patientName: s.patientName || "",
      startedAt: s.startedAt || "",
      durationMinutes: String(s.durationMinutes ?? 0),
      videoUploaded: Boolean(s.videoUploaded),
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft) return;
    if (!editDraft.patientName.trim()) {
      setMessage({ type: "err", text: "Patient name is required." });
      return;
    }
    setSavingEdit(true);
    setMessage(null);
    try {
      await api(`/reports/therapist-sessions/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          sessionDate: editDraft.sessionDate,
          patientName: editDraft.patientName.trim(),
          startedAt: editDraft.startedAt,
          durationMinutes: Number(editDraft.durationMinutes) || 0,
          videoUploaded: editDraft.videoUploaded,
        }),
      });
      setMessage({ type: "ok", text: "Session updated." });
      setEditingId(null);
      setEditDraft(null);
      setRefreshToken((v) => v + 1);
    } catch (e) {
      setMessage({ type: "err", text: e instanceof ApiError ? e.message : "Could not update session." });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <section className="rounded-xl border-2 border-brand-200/80 bg-gradient-to-br from-brand-50/90 to-white p-4 shadow-card dark:border-brand-900/50 dark:from-brand-950/40 dark:to-zinc-950 sm:rounded-2xl sm:p-5">
      {isSupervisor && (
        <div className="mb-5">
          <div className="rounded-xl border border-brand-200/80 bg-white/80 p-3 shadow-card dark:border-brand-900/50 dark:bg-zinc-950/70 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Supervisor Module</div>
                <h3 className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">Daily Supervisor Sheet</h3>
                <p className="mt-1 text-[11px] text-zinc-500">Open this sheet to fill yes/no status and remarks for mandatory supervisor daily checks.</p>
              </div>
              <Button
                size="sm"
                variant={showSupervisorSheet ? "soft" : "gradient"}
                className="w-full gap-2 sm:w-auto"
                onClick={() => setShowSupervisorSheet((v) => !v)}
              >
                <ClipboardCheck className="h-4 w-4" />
                {showSupervisorSheet ? "Hide Supervisor Sheet" : "Open Supervisor Sheet"}
              </Button>
            </div>
          </div>
          {showSupervisorSheet && (
            <div className="mt-3 rounded-xl border border-zinc-200/80 bg-white p-3 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Supervisor Daily Task Sheet</h3>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Only the supervisor sheet tasks from your provided format are listed here. Use multiple sheets for the same day when
                    you need separate records (e.g. different rounds or locations). After saving, use{" "}
                    <span className="font-semibold">View saved</span> to review without editing.
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={svRo ? "gradient" : "outline"}
                    className="h-9 gap-1.5 px-3 text-xs"
                    onClick={() => {
                      setSupervisorSheetReloadNonce((n) => n + 1);
                      setSupervisorSheetViewOnly(true);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View saved
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!svRo ? "gradient" : "outline"}
                    className="h-9 gap-1.5 px-3 text-xs"
                    onClick={() => setSupervisorSheetViewOnly(false)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              </div>
              {svRo && (
                <p className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
                  Read-only mode. Switch tabs to view other sheets for this date. Click Edit to make changes.
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const nonDefaultTabs = mergedSupervisorSheetTabs.filter((t) => t.instanceKey !== "default");
                    return mergedSupervisorSheetTabs.map((tab) => {
                      let tabTitle: string;
                      if (tab.instanceKey === "default") tabTitle = "Main sheet";
                      else if (tab.label.trim()) tabTitle = tab.label.trim();
                      else {
                        const i = nonDefaultTabs.findIndex((t) => t.instanceKey === tab.instanceKey);
                        tabTitle = `Sheet ${i >= 0 ? i + 2 : 2}`;
                      }
                      const isActive = activeSupervisorSheetKey === tab.instanceKey;
                      return (
                        <button
                          key={tab.instanceKey}
                          type="button"
                          onClick={() => setActiveSupervisorSheetKey(tab.instanceKey)}
                          className={
                            isActive
                              ? "rounded-lg border border-brand-500 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-900 shadow-sm dark:border-brand-600 dark:bg-brand-950/50 dark:text-brand-100"
                              : "rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-brand-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-brand-800 dark:hover:bg-zinc-800"
                          }
                        >
                          {tabTitle}
                        </button>
                      );
                    });
                  })()}
                  <Button
                    type="button"
                    size="sm"
                    variant="soft"
                    className="h-8 gap-1 px-2.5 text-xs"
                    disabled={svRo}
                    onClick={addSupervisorSheetTab}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add sheet
                  </Button>
                  {activeSupervisorSheetKey !== "default" && (
                    <button
                      type="button"
                      disabled={svRo}
                      onClick={() => void removeActiveSupervisorSheetTab()}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-800 hover:bg-red-100 disabled:pointer-events-none disabled:opacity-40 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove sheet
                    </button>
                  )}
                </div>
                <label className="flex max-w-md flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Sheet label (optional)</span>
                  <Input
                    value={supervisorSheetLabelDraft}
                    readOnly={svRo}
                    onChange={(e) => setSupervisorSheetLabelDraft(e.target.value)}
                    placeholder="e.g. OPD morning, Parent session"
                    className="h-9 text-xs"
                  />
                </label>
              </div>
              <div className="mt-3 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="text-left text-[11px] uppercase text-zinc-500">
                    <tr>
                      <th className="px-2 py-1.5">Task</th>
                      <th className="px-2 py-1.5">Details</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SUPERVISOR_SHEET_TASKS.map((row) => {
                      const isTherapyPlan = supportsTherapyPlanRows(row.key);
                      const isExpanded = Boolean(expandedTaskKeys[row.key]);
                      const therapyPlanRows = sheetTherapyPlanRowsByTask[row.key] || [newTherapyPlanRow()];
                      return (
                        <Fragment key={row.key}>
                          <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                            <td className="px-2 py-1.5">
                              {isTherapyPlan ? (
                                <button
                                  type="button"
                                  onClick={() => setExpandedTaskKeys((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                                  className="inline-flex items-center gap-2 font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
                                >
                                  {row.task}
                                  <span className="text-[10px] uppercase">{isExpanded ? "Hide" : "Open"}</span>
                                </button>
                              ) : (
                                row.task
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {supportsSessionNames(row.key) || supportsDateRange() ? (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {supportsSessionNames(row.key) && (
                                    <>
                                      <Input
                                        placeholder="Therapist name"
                                        value={sheetTherapistNameByTask[row.key] || ""}
                                        readOnly={svRo}
                                        onChange={(e) => setSheetTherapistNameByTask((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                        className="h-8 min-w-[180px] px-2.5 text-xs"
                                      />
                                      <Input
                                        placeholder="Patient name"
                                        value={sheetPatientNameByTask[row.key] || ""}
                                        readOnly={svRo}
                                        onChange={(e) => setSheetPatientNameByTask((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                        className="h-8 min-w-[180px] px-2.5 text-xs"
                                      />
                                    </>
                                  )}
                                  {supportsDateRange() && (
                                    <>
                                      <Input
                                        type="date"
                                        placeholder="Date from"
                                        value={sheetDateFromByTask[row.key] || ""}
                                        readOnly={svRo}
                                        onChange={(e) => setSheetDateFromByTask((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                        className="h-8 min-w-[160px] px-2.5 text-xs"
                                      />
                                      <Input
                                        type="date"
                                        placeholder="Date to"
                                        value={sheetDateToByTask[row.key] || ""}
                                        readOnly={svRo}
                                        onChange={(e) => setSheetDateToByTask((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                        className="h-8 min-w-[160px] px-2.5 text-xs"
                                      />
                                    </>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-400">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <Select
                                value={sheetStatusByTask[row.key] || "no"}
                                onChange={(e) =>
                                  setSheetStatusByTask((prev) => ({ ...prev, [row.key]: e.target.value === "yes" ? "yes" : "no" }))
                                }
                                disabled={svRo}
                                className="h-8 min-w-[100px] px-2.5 text-xs"
                              >
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                              </Select>
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                placeholder="Remarks (optional)"
                                value={sheetRemarksByTask[row.key] || ""}
                                readOnly={svRo}
                                onChange={(e) => setSheetRemarksByTask((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                className="h-8 min-w-[220px] px-2.5 text-xs"
                              />
                            </td>
                          </tr>
                          {isTherapyPlan && isExpanded && (
                            <tr className="border-t border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30">
                              <td colSpan={4} className="px-2 py-2">
                                <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950">
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Therapy Plan Details</div>
                                    {!svRo && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSheetTherapyPlanRowsByTask((prev) => ({
                                            ...prev,
                                            [row.key]: [...(prev[row.key] || [newTherapyPlanRow()]), newTherapyPlanRow()],
                                          }))
                                        }
                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-950/40"
                                        aria-label="Add therapy plan row"
                                        title="Add row"
                                      >
                                        <Plus className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_120px_minmax(0,1fr)_minmax(0,1fr)]">
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Name</div>
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Time</div>
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Room no.</div>
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Child</div>
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Activity</div>
                                    {therapyPlanRows.map((plan) => (
                                      <Fragment key={plan.id}>
                                        <Input
                                          key={`${plan.id}-name`}
                                          placeholder="Name"
                                          value={plan.name}
                                          readOnly={svRo}
                                          onChange={(e) =>
                                            setSheetTherapyPlanRowsByTask((prev) => ({
                                              ...prev,
                                              [row.key]: (prev[row.key] || []).map((p) =>
                                                p.id === plan.id ? { ...p, name: e.target.value } : p
                                              ),
                                            }))
                                          }
                                          className="h-8 px-2.5 text-xs"
                                        />
                                        <Input
                                          key={`${plan.id}-time`}
                                          type="time"
                                          value={plan.time}
                                          readOnly={svRo}
                                          onChange={(e) =>
                                            setSheetTherapyPlanRowsByTask((prev) => ({
                                              ...prev,
                                              [row.key]: (prev[row.key] || []).map((p) =>
                                                p.id === plan.id ? { ...p, time: e.target.value } : p
                                              ),
                                            }))
                                          }
                                          className="h-8 px-2.5 text-xs"
                                        />
                                        <Input
                                          key={`${plan.id}-room`}
                                          placeholder="Room no."
                                          value={plan.roomNo}
                                          readOnly={svRo}
                                          onChange={(e) =>
                                            setSheetTherapyPlanRowsByTask((prev) => ({
                                              ...prev,
                                              [row.key]: (prev[row.key] || []).map((p) =>
                                                p.id === plan.id ? { ...p, roomNo: e.target.value } : p
                                              ),
                                            }))
                                          }
                                          className="h-8 px-2.5 text-xs"
                                        />
                                        <Input
                                          key={`${plan.id}-child`}
                                          placeholder="Child"
                                          value={plan.child}
                                          readOnly={svRo}
                                          onChange={(e) =>
                                            setSheetTherapyPlanRowsByTask((prev) => ({
                                              ...prev,
                                              [row.key]: (prev[row.key] || []).map((p) =>
                                                p.id === plan.id ? { ...p, child: e.target.value } : p
                                              ),
                                            }))
                                          }
                                          className="h-8 px-2.5 text-xs"
                                        />
                                        <Input
                                          key={`${plan.id}-activity`}
                                          placeholder="Activity"
                                          value={plan.activity}
                                          readOnly={svRo}
                                          onChange={(e) =>
                                            setSheetTherapyPlanRowsByTask((prev) => ({
                                              ...prev,
                                              [row.key]: (prev[row.key] || []).map((p) =>
                                                p.id === plan.id ? { ...p, activity: e.target.value } : p
                                              ),
                                            }))
                                          }
                                          className="h-8 px-2.5 text-xs"
                                        />
                                      </Fragment>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 space-y-2 md:hidden">
                {SUPERVISOR_SHEET_TASKS.map((row) => {
                  const isTherapyPlan = supportsTherapyPlanRows(row.key);
                  const therapyPlanRows = sheetTherapyPlanRowsByTask[row.key] || [newTherapyPlanRow()];
                  return (
                    <div key={`mobile-${row.key}`} className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800">
                      <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">{row.task}</div>
                      <div className="mt-2">
                        {supportsSessionNames(row.key) || supportsDateRange() ? (
                          <div className="grid gap-2">
                            {supportsSessionNames(row.key) && (
                              <>
                                <Input
                                  placeholder="Therapist name"
                                  value={sheetTherapistNameByTask[row.key] || ""}
                                  readOnly={svRo}
                                  onChange={(e) => setSheetTherapistNameByTask((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                  className="h-8 text-xs"
                                />
                                <Input
                                  placeholder="Patient name"
                                  value={sheetPatientNameByTask[row.key] || ""}
                                  readOnly={svRo}
                                  onChange={(e) => setSheetPatientNameByTask((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                  className="h-8 text-xs"
                                />
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400">No details</span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <Select
                          value={sheetStatusByTask[row.key] || "no"}
                          onChange={(e) =>
                            setSheetStatusByTask((prev) => ({ ...prev, [row.key]: e.target.value === "yes" ? "yes" : "no" }))
                          }
                          disabled={svRo}
                          className="h-8 text-xs"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </Select>
                        <Input
                          placeholder="Remarks (optional)"
                          value={sheetRemarksByTask[row.key] || ""}
                          readOnly={svRo}
                          onChange={(e) => setSheetRemarksByTask((prev) => ({ ...prev, [row.key]: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                      {isTherapyPlan && (
                        <div className="mt-2 rounded-md bg-zinc-50 p-2 dark:bg-zinc-900">
                          <div className="mb-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Therapy Plan Details</div>
                          <div className="space-y-2">
                            {therapyPlanRows.map((plan) => (
                              <div key={`m-${plan.id}`} className="grid gap-1">
                                <Input
                                  placeholder="Name"
                                  value={plan.name}
                                  readOnly={svRo}
                                  onChange={(e) =>
                                    setSheetTherapyPlanRowsByTask((prev) => ({
                                      ...prev,
                                      [row.key]: (prev[row.key] || []).map((p) => (p.id === plan.id ? { ...p, name: e.target.value } : p)),
                                    }))
                                  }
                                  className="h-8 text-xs"
                                />
                                <Input
                                  placeholder="Child"
                                  value={plan.child}
                                  readOnly={svRo}
                                  onChange={(e) =>
                                    setSheetTherapyPlanRowsByTask((prev) => ({
                                      ...prev,
                                      [row.key]: (prev[row.key] || []).map((p) => (p.id === plan.id ? { ...p, child: e.target.value } : p)),
                                    }))
                                  }
                                  className="h-8 text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end">
                {!svRo && (
                  <Button size="sm" variant="gradient" onClick={() => void saveSupervisorSheet()} disabled={savingSheet}>
                    {savingSheet ? "Saving..." : "Save supervisor sheet"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-100 pb-4 dark:border-brand-900/40">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Daily · Therapists</div>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Patient session log</h2>
          <p className="mt-1 max-w-2xl text-xs text-zinc-600 dark:text-zinc-400">
            Log every session for the selected date. This block is separate from your assigned recurring tasks below. Use + to add more
            rows, then save all at once.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <label className="space-y-1 sm:w-auto">
            <span className="text-xs font-semibold text-zinc-500">Date</span>
            <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="w-full sm:w-[160px]" />
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs font-medium text-zinc-500">More sessions</span>
        <button
          type="button"
          onClick={() => addRow()}
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-brand-400 bg-white text-brand-700 shadow-sm hover:bg-brand-50 dark:border-brand-600 dark:bg-zinc-900 dark:text-brand-300 dark:hover:bg-brand-950/50"
          aria-label="Add another session row"
          title="Add session"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div className="hidden gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 md:grid md:grid-cols-[minmax(0,1.2fr)_100px_120px_140px_40px] md:px-1">
          <span>Patient</span>
          <span>Duration (min)</span>
          <span>Start time</span>
          <span>Video uploaded</span>
          <span />
        </div>

        {rows.map((r) => (
          <div
            key={r.id}
            className="grid gap-2 rounded-xl border border-zinc-200 bg-white/90 p-3 dark:border-zinc-700 dark:bg-zinc-900/80 md:grid-cols-[minmax(0,1.2fr)_100px_120px_140px_40px] md:items-end"
          >
            <label className="space-y-1 md:col-span-1">
              <span className="text-xs font-semibold text-zinc-500 md:hidden">Patient name</span>
              <Input placeholder="Patient name" value={r.patientName} onChange={(e) => patchRow(r.id, { patientName: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-zinc-500 md:hidden">Duration (min)</span>
              <Input
                type="number"
                min={0}
                value={r.durationMinutes}
                onChange={(e) => patchRow(r.id, { durationMinutes: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-zinc-500 md:hidden">Start time</span>
              <Input type="time" value={r.startedAt} onChange={(e) => patchRow(r.id, { startedAt: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium dark:border-zinc-700">
              <input
                type="checkbox"
                checked={r.videoUploaded}
                onChange={(e) => patchRow(r.id, { videoUploaded: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-300 text-brand-600"
              />
              Video uploaded
            </label>
            <div className="flex items-end justify-end">
              <button
                type="button"
                onClick={() => removeRow(r.id)}
                disabled={rows.length <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:border-rose-200 hover:text-rose-600 disabled:opacity-40 dark:border-zinc-700"
                aria-label="Remove row"
                title="Remove row"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {message && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-brand-100 pt-4 dark:border-brand-900/40 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] text-zinc-500">
          {isSupervisor
            ? "Saving your own supervisor sessions."
            : "Saved sessions appear on Therapist Performance for supervisors."}
        </p>
        <Button type="button" onClick={() => void submit()} disabled={submitting} className="w-full gap-2 sm:w-auto">
          {submitting ? "Saving…" : "Save all sessions"}
        </Button>
      </div>

      <div className="mt-5 rounded-xl border border-zinc-200/80 bg-white p-3 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Recent uploaded sessions</h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              {loadingUploaded
                ? "Loading session count..."
                : `${uploadedSessions.length} session${uploadedSessions.length === 1 ? "" : "s"} in selected range`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span>From</span>
              <Input type="date" value={viewFrom} onChange={(e) => setViewFrom(e.target.value)} className="h-8 min-w-[148px] px-2.5 text-xs" />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span>To</span>
              <Input type="date" value={viewTo} onChange={(e) => setViewTo(e.target.value)} className="h-8 min-w-[148px] px-2.5 text-xs" />
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const today = todayIsoDate();
                setViewFrom(today);
                setViewTo(today);
              }}
            >
              Today
            </Button>
          </div>
        </div>
        {loadingUploaded ? (
          <p className="mt-3 text-xs text-zinc-500">Loading sessions...</p>
        ) : uploadedSessions.length ? (
          <>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-left text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Patient</th>
                  <th className="px-2 py-1.5">Start</th>
                  <th className="px-2 py-1.5">Duration</th>
                  <th className="px-2 py-1.5">Video</th>
                  <th className="px-2 py-1.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {uploadedSessions.map((s) => {
                  const editable = canEditUploaded(s);
                  const isEditing = editingId === s._id && !!editDraft;
                  return (
                    <tr key={s._id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <Input
                            type="date"
                            value={editDraft.sessionDate}
                            onChange={(e) => setEditDraft((p) => (p ? { ...p, sessionDate: e.target.value } : p))}
                            className="h-8 min-w-[148px] px-2.5 text-xs"
                          />
                        ) : (
                          s.sessionDate
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <Input
                            value={editDraft.patientName}
                            onChange={(e) => setEditDraft((p) => (p ? { ...p, patientName: e.target.value } : p))}
                            className="h-8 min-w-[170px] px-2.5 text-xs"
                          />
                        ) : (
                          s.patientName
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <Input
                            type="time"
                            value={editDraft.startedAt}
                            onChange={(e) => setEditDraft((p) => (p ? { ...p, startedAt: e.target.value } : p))}
                            className="h-8 min-w-[120px] px-2.5 text-xs"
                          />
                        ) : (
                          s.startedAt || "—"
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <Input
                            type="number"
                            min={0}
                            value={editDraft.durationMinutes}
                            onChange={(e) => setEditDraft((p) => (p ? { ...p, durationMinutes: e.target.value } : p))}
                            className="h-8 min-w-[100px] px-2.5 text-xs"
                          />
                        ) : (
                          `${s.durationMinutes || 0} min`
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <label className="inline-flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={editDraft.videoUploaded}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, videoUploaded: e.target.checked } : p))}
                              className="h-4 w-4 rounded border-zinc-300 text-brand-600"
                            />
                            Yes
                          </label>
                        ) : s.videoUploaded ? (
                          "Yes"
                        ) : (
                          "No"
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="gradient" onClick={() => void saveEdit()} disabled={savingEdit}>
                              {savingEdit ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(null);
                                setEditDraft(null);
                              }}
                              disabled={savingEdit}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : editable ? (
                          <Button size="sm" variant="outline" onClick={() => beginEdit(s)}>
                            Edit
                          </Button>
                        ) : (
                          <span className="text-[11px] text-zinc-400">Locked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-2 md:hidden">
            {uploadedSessions.map((s) => {
              const editable = canEditUploaded(s);
              const isEditing = editingId === s._id && !!editDraft;
              return (
                <div key={`mobile-s-${s._id}`} className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800">
                  {isEditing ? (
                    <div className="grid gap-2">
                      <Input
                        type="date"
                        value={editDraft.sessionDate}
                        onChange={(e) => setEditDraft((p) => (p ? { ...p, sessionDate: e.target.value } : p))}
                        className="h-8 text-xs"
                      />
                      <Input
                        value={editDraft.patientName}
                        onChange={(e) => setEditDraft((p) => (p ? { ...p, patientName: e.target.value } : p))}
                        className="h-8 text-xs"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="gradient" onClick={() => void saveEdit()} disabled={savingEdit}>
                          {savingEdit ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                          disabled={savingEdit}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="font-semibold text-zinc-800 dark:text-zinc-100">{s.patientName}</div>
                      <div className="text-xs text-zinc-500">
                        {s.sessionDate} · {s.startedAt || "—"} · {s.durationMinutes || 0} min · Video {s.videoUploaded ? "Yes" : "No"}
                      </div>
                      <div className="mt-2">
                        {editable ? (
                          <Button size="sm" variant="outline" onClick={() => beginEdit(s)}>
                            Edit
                          </Button>
                        ) : (
                          <span className="text-[11px] text-zinc-400">Locked</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          </>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            No uploaded sessions found for {viewFrom || "start"} to {viewTo || "end"}.
          </p>
        )}
      </div>
    </section>
  );
}
