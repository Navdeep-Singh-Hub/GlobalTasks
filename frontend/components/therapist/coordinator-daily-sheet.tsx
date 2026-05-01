"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { ClipboardCheck, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Fragment, useEffect, useState } from "react";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

type CoordinatorSheetRow = {
  key: string;
  task: string;
};

const PARENT_MEETING_TASK_KEY = "parent-meeting";
const OPD_MEETING_PARENTS_KEY = "opd-meeting-parents";
const NEW_PARENTS_WAITING_PACKAGE_KEY = "new-parents-waiting-package";
const PARENTING_SESSION_KEY = "parenting-session";
const SESSION_OBSERVATION_KEY = "session-observation";
const ROUNDS_OF_CENTRE_KEY = "rounds-of-centre";

type ChildNameRow = { id: string; name: string };

/** Same grid shape as supervisor “Supervisor round notes complete” (therapy plan) row. */
type RoundsPlanRow = {
  id: string;
  name: string;
  time: string;
  roomNo: string;
  child: string;
  activity: string;
};

function newChildNameRow(): ChildNameRow {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, name: "" };
}

function ChildNameListEditor({
  rows,
  setRows,
  readOnly,
}: {
  rows: ChildNameRow[];
  setRows: Dispatch<SetStateAction<ChildNameRow[]>>;
  readOnly?: boolean;
}) {
  if (readOnly) {
    const names = rows.map((c) => c.name.trim()).filter(Boolean);
    return (
      <div className="min-w-[220px] text-xs leading-snug text-zinc-800 dark:text-zinc-100">{names.length ? names.join(", ") : "—"}</div>
    );
  }
  return (
    <div className="min-w-[220px] space-y-2">
      {rows.map((child) => (
        <div key={child.id} className="flex items-center gap-1">
          <Input
            placeholder="Child name"
            value={child.name}
            onChange={(e) =>
              setRows((prev) => prev.map((c) => (c.id === child.id ? { ...c, name: e.target.value } : c)))
            }
            className="h-8 min-w-0 flex-1 px-2.5 text-xs"
          />
          <button
            type="button"
            onClick={() => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== child.id)))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 hover:border-rose-200 hover:text-rose-600 disabled:opacity-30 dark:border-zinc-700"
            aria-label="Remove child"
            disabled={rows.length <= 1}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, newChildNameRow()])}
        className="inline-flex items-center gap-1 rounded-lg border border-brand-300 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-950/40"
      >
        <Plus className="h-3.5 w-3.5" />
        Add child
      </button>
    </div>
  );
}

function parseParentMeetingRemarks(raw: string): { children: string[]; note: string } {
  if (!String(raw || "").trim()) return { children: [], note: "" };
  try {
    const p = JSON.parse(raw) as { children?: unknown; remarks?: unknown };
    if (p && typeof p === "object") {
      const arr = Array.isArray(p.children) ? p.children.map((x) => String(x ?? "").trim()) : [];
      return { children: arr, note: String(p.remarks ?? "").trim() };
    }
  } catch {
    return { children: [], note: String(raw).trim() };
  }
  return { children: [], note: "" };
}

function serializeParentMeetingRemarks(children: ChildNameRow[], note: string): string {
  const names = children.map((c) => c.name.trim()).filter(Boolean);
  const trimmedNote = note.trim();
  return JSON.stringify({ children: names, remarks: trimmedNote });
}

function newRoundsPlanRow(): RoundsPlanRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: "",
    time: "",
    roomNo: "",
    child: "",
    activity: "",
  };
}

function parseRoundsOfCentreRemarks(raw: string): { note: string; rows: RoundsPlanRow[] } {
  if (!String(raw || "").trim()) return { note: "", rows: [newRoundsPlanRow()] };
  try {
    const p = JSON.parse(raw) as {
      remarks?: string;
      therapyPlanRows?: { name?: string; time?: string; roomNo?: string; child?: string; activity?: string }[];
    };
    if (p && typeof p === "object") {
      const rows = Array.isArray(p.therapyPlanRows)
        ? p.therapyPlanRows.map((r, i) => ({
            id: `rc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            name: String(r?.name || ""),
            time: String(r?.time || ""),
            roomNo: String(r?.roomNo || ""),
            child: String(r?.child || ""),
            activity: String(r?.activity || ""),
          }))
        : [];
      return {
        note: String(p.remarks ?? "").trim(),
        rows: rows.length ? rows : [newRoundsPlanRow()],
      };
    }
  } catch {
    return { note: String(raw).trim(), rows: [newRoundsPlanRow()] };
  }
  return { note: "", rows: [newRoundsPlanRow()] };
}

function serializeRoundsOfCentreRemarks(rows: RoundsPlanRow[], note: string): string {
  return JSON.stringify({
    remarks: note.trim(),
    therapyPlanRows: rows.map(({ name, time, roomNo, child, activity }) => ({
      name,
      time,
      roomNo,
      child,
      activity,
    })),
  });
}

/** Coordinator sheet — daily tasks only. */
const COORDINATOR_SHEET_TASKS: CoordinatorSheetRow[] = [
  { key: "parent-meeting", task: "PARENT MEETING" },
  { key: "rounds-of-centre", task: "Rounds of centre" },
  { key: "opd-meeting-parents", task: "OPD meeting with parents" },
  { key: "new-parents-waiting-package", task: "new parents waiting for package" },
  { key: "send-videos-daily-sessions", task: "Send videos of daily sessions" },
  { key: "parenting-session", task: "PARENTING SESSION" },
  { key: "session-observation", task: "Session observation" },
  { key: "g-form-filling", task: "G-Form filling" },
];

export function CoordinatorDailySheet() {
  const { user } = useAuth();
  const isCoordinator = user?.role === "coordinator";
  const [sheetDate, setSheetDate] = useState(todayIsoDate);
  const [open, setOpen] = useState(false);
  const [statusByTask, setStatusByTask] = useState<Record<string, "yes" | "no">>({});
  const [remarksByTask, setRemarksByTask] = useState<Record<string, string>>({});
  const [parentMeetingChildren, setParentMeetingChildren] = useState<ChildNameRow[]>(() => [newChildNameRow()]);
  const [opdMeetingChildren, setOpdMeetingChildren] = useState<ChildNameRow[]>(() => [newChildNameRow()]);
  const [newParentsWaitingChildren, setNewParentsWaitingChildren] = useState<ChildNameRow[]>(() => [newChildNameRow()]);
  const [parentingSessionChildren, setParentingSessionChildren] = useState<ChildNameRow[]>(() => [newChildNameRow()]);
  const [sessionObservationChildren, setSessionObservationChildren] = useState<ChildNameRow[]>(() => [newChildNameRow()]);
  const [roundsPlanRows, setRoundsPlanRows] = useState<RoundsPlanRow[]>(() => [newRoundsPlanRow()]);
  const [expandedRoundsCentre, setExpandedRoundsCentre] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [sheetViewOnly, setSheetViewOnly] = useState(false);
  const [sheetReloadNonce, setSheetReloadNonce] = useState(0);

  useEffect(() => {
    setSheetViewOnly(false);
  }, [sheetDate]);

  useEffect(() => {
    if (!isCoordinator || !user?._id) return;
    const qs = new URLSearchParams();
    qs.set("sheetDate", sheetDate);
    qs.set("coordinatorId", user._id);
    api<{ entries: { taskKey: string; status?: string; remarks?: string }[] }>(`/reports/coordinator-sheet?${qs.toString()}`)
      .then((d) => {
        const entries = Array.isArray(d.entries) ? d.entries : [];
        const nextStatus: Record<string, "yes" | "no"> = {};
        const nextRemarks: Record<string, string> = {};
        for (const row of COORDINATOR_SHEET_TASKS) {
          nextStatus[row.key] = "no";
          nextRemarks[row.key] = "";
        }
        let pmChildren: ChildNameRow[] | null = null;
        let opdChildren: ChildNameRow[] | null = null;
        let npwChildren: ChildNameRow[] | null = null;
        let psChildren: ChildNameRow[] | null = null;
        let soChildren: ChildNameRow[] | null = null;
        let rmRounds: RoundsPlanRow[] | null = null;
        for (const e of entries) {
          if (!e?.taskKey) continue;
          nextStatus[e.taskKey] = String(e.status || "").toLowerCase() === "yes" ? "yes" : "no";
          if (e.taskKey === PARENT_MEETING_TASK_KEY) {
            const parsed = parseParentMeetingRemarks(String(e.remarks || ""));
            nextRemarks[e.taskKey] = parsed.note;
            pmChildren =
              parsed.children.length > 0
                ? parsed.children.map((name, i) => ({ id: `pm-${sheetDate}-${i}-${name.slice(0, 8)}`, name }))
                : [newChildNameRow()];
          } else if (e.taskKey === OPD_MEETING_PARENTS_KEY) {
            const parsed = parseParentMeetingRemarks(String(e.remarks || ""));
            nextRemarks[e.taskKey] = parsed.note;
            opdChildren =
              parsed.children.length > 0
                ? parsed.children.map((name, i) => ({ id: `opd-${sheetDate}-${i}-${name.slice(0, 8)}`, name }))
                : [newChildNameRow()];
          } else if (e.taskKey === NEW_PARENTS_WAITING_PACKAGE_KEY) {
            const parsed = parseParentMeetingRemarks(String(e.remarks || ""));
            nextRemarks[e.taskKey] = parsed.note;
            npwChildren =
              parsed.children.length > 0
                ? parsed.children.map((name, i) => ({ id: `npw-${sheetDate}-${i}-${name.slice(0, 8)}`, name }))
                : [newChildNameRow()];
          } else if (e.taskKey === PARENTING_SESSION_KEY) {
            const parsed = parseParentMeetingRemarks(String(e.remarks || ""));
            nextRemarks[e.taskKey] = parsed.note;
            psChildren =
              parsed.children.length > 0
                ? parsed.children.map((name, i) => ({ id: `ps-${sheetDate}-${i}-${name.slice(0, 8)}`, name }))
                : [newChildNameRow()];
          } else if (e.taskKey === SESSION_OBSERVATION_KEY) {
            const parsed = parseParentMeetingRemarks(String(e.remarks || ""));
            nextRemarks[e.taskKey] = parsed.note;
            soChildren =
              parsed.children.length > 0
                ? parsed.children.map((name, i) => ({ id: `so-${sheetDate}-${i}-${name.slice(0, 8)}`, name }))
                : [newChildNameRow()];
          } else if (e.taskKey === ROUNDS_OF_CENTRE_KEY) {
            const parsed = parseRoundsOfCentreRemarks(String(e.remarks || ""));
            nextRemarks[e.taskKey] = parsed.note;
            rmRounds = parsed.rows;
          } else {
            nextRemarks[e.taskKey] = String(e.remarks || "");
          }
        }
        setStatusByTask(nextStatus);
        setRemarksByTask(nextRemarks);
        setParentMeetingChildren(pmChildren ?? [newChildNameRow()]);
        setOpdMeetingChildren(opdChildren ?? [newChildNameRow()]);
        setNewParentsWaitingChildren(npwChildren ?? [newChildNameRow()]);
        setParentingSessionChildren(psChildren ?? [newChildNameRow()]);
        setSessionObservationChildren(soChildren ?? [newChildNameRow()]);
        setRoundsPlanRows(rmRounds ?? [newRoundsPlanRow()]);
      })
      .catch(() => {
        const nextStatus: Record<string, "yes" | "no"> = {};
        const nextRemarks: Record<string, string> = {};
        for (const row of COORDINATOR_SHEET_TASKS) {
          nextStatus[row.key] = "no";
          nextRemarks[row.key] = "";
        }
        setStatusByTask(nextStatus);
        setRemarksByTask(nextRemarks);
        setParentMeetingChildren([newChildNameRow()]);
        setOpdMeetingChildren([newChildNameRow()]);
        setNewParentsWaitingChildren([newChildNameRow()]);
        setParentingSessionChildren([newChildNameRow()]);
        setSessionObservationChildren([newChildNameRow()]);
        setRoundsPlanRows([newRoundsPlanRow()]);
      });
  }, [isCoordinator, sheetDate, user?._id, sheetReloadNonce]);

  const save = async () => {
    if (!isCoordinator || !user?._id) return;
    setSaving(true);
    setMessage(null);
    try {
      const entries = COORDINATOR_SHEET_TASKS.map((row) => ({
        taskKey: row.key,
        status: statusByTask[row.key] || "no",
        remarks:
          row.key === PARENT_MEETING_TASK_KEY
            ? serializeParentMeetingRemarks(parentMeetingChildren, remarksByTask[row.key] || "")
            : row.key === OPD_MEETING_PARENTS_KEY
              ? serializeParentMeetingRemarks(opdMeetingChildren, remarksByTask[row.key] || "")
              : row.key === NEW_PARENTS_WAITING_PACKAGE_KEY
                ? serializeParentMeetingRemarks(newParentsWaitingChildren, remarksByTask[row.key] || "")
                : row.key === PARENTING_SESSION_KEY
                  ? serializeParentMeetingRemarks(parentingSessionChildren, remarksByTask[row.key] || "")
                  : row.key === SESSION_OBSERVATION_KEY
                    ? serializeParentMeetingRemarks(sessionObservationChildren, remarksByTask[row.key] || "")
                    : row.key === ROUNDS_OF_CENTRE_KEY
                      ? serializeRoundsOfCentreRemarks(roundsPlanRows, remarksByTask[row.key] || "")
                      : remarksByTask[row.key] || "",
      }));
      await api("/reports/coordinator-sheet", {
        method: "PUT",
        body: JSON.stringify({
          coordinatorId: user._id,
          sheetDate,
          entries,
        }),
      });
      setSheetViewOnly(true);
      setMessage({ type: "ok", text: "Coordinator sheet saved." });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof ApiError ? e.message : "Could not save coordinator sheet." });
    } finally {
      setSaving(false);
    }
  };

  if (!isCoordinator) return null;

  const ro = sheetViewOnly;

  return (
    <section className="mb-8 rounded-xl border-2 border-brand-200/80 bg-gradient-to-br from-brand-50/90 to-white p-4 shadow-card dark:border-brand-900/50 dark:from-brand-950/40 dark:to-zinc-950 sm:rounded-2xl sm:p-5">
      <div className="rounded-xl border border-brand-200/80 bg-white/80 p-3 shadow-card dark:border-brand-900/50 dark:bg-zinc-950/70 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Coordinator Module</div>
            <h3 className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">Daily Coordinator Sheet</h3>
            <p className="mt-1 text-[11px] text-zinc-500">Fill status and remarks for each coordinator task for the selected date.</p>
          </div>
          <Button size="sm" variant={open ? "soft" : "gradient"} className="w-full gap-2 sm:w-auto" onClick={() => setOpen((v) => !v)}>
            <ClipboardCheck className="h-4 w-4" />
            {open ? "Hide Coordinator Sheet" : "Open Coordinator Sheet"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              <span>Sheet date</span>
              <Input
                type="date"
                value={sheetDate}
                onChange={(e) => setSheetDate(e.target.value)}
                disabled={ro}
                className="h-9 w-[160px] px-2.5 text-xs"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={ro ? "gradient" : "outline"}
                className="h-9 gap-1.5 px-3 text-xs"
                onClick={() => {
                  setSheetReloadNonce((n) => n + 1);
                  setSheetViewOnly(true);
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                View saved
              </Button>
              <Button type="button" size="sm" variant={!ro ? "gradient" : "outline"} className="h-9 gap-1.5 px-3 text-xs" onClick={() => setSheetViewOnly(false)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200/80 bg-white p-3 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:p-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Coordinator Daily Task Sheet</h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              Tasks match your coordinator checklist format. After saving, use <span className="font-semibold">View saved</span> to read your entries without editing.
            </p>
            {ro && (
              <p className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
                Read-only mode. Click Edit to change this sheet.
              </p>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="text-left text-[11px] uppercase text-zinc-500">
                  <tr>
                    <th className="px-2 py-1.5">Task</th>
                    <th className="px-2 py-1.5">Child name(s)</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {COORDINATOR_SHEET_TASKS.map((row) => {
                    const isRoundsExpandable = row.key === ROUNDS_OF_CENTRE_KEY;
                    return (
                      <Fragment key={row.key}>
                        <tr className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="px-2 py-1.5 align-top">
                            {isRoundsExpandable ? (
                              <button
                                type="button"
                                onClick={() => setExpandedRoundsCentre((v) => !v)}
                                className="inline-flex items-center gap-2 font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
                              >
                                {row.task}
                                <span className="text-[10px] uppercase">{expandedRoundsCentre ? "Hide" : "Open"}</span>
                              </button>
                            ) : (
                              row.task
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            {row.key === PARENT_MEETING_TASK_KEY ? (
                              <ChildNameListEditor rows={parentMeetingChildren} setRows={setParentMeetingChildren} readOnly={ro} />
                            ) : row.key === OPD_MEETING_PARENTS_KEY ? (
                              <ChildNameListEditor rows={opdMeetingChildren} setRows={setOpdMeetingChildren} readOnly={ro} />
                            ) : row.key === NEW_PARENTS_WAITING_PACKAGE_KEY ? (
                              <ChildNameListEditor rows={newParentsWaitingChildren} setRows={setNewParentsWaitingChildren} readOnly={ro} />
                            ) : row.key === PARENTING_SESSION_KEY ? (
                              <ChildNameListEditor rows={parentingSessionChildren} setRows={setParentingSessionChildren} readOnly={ro} />
                            ) : row.key === SESSION_OBSERVATION_KEY ? (
                              <ChildNameListEditor rows={sessionObservationChildren} setRows={setSessionObservationChildren} readOnly={ro} />
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <Select
                              value={statusByTask[row.key] || "no"}
                              onChange={(e) =>
                                setStatusByTask((prev) => ({ ...prev, [row.key]: e.target.value === "yes" ? "yes" : "no" }))
                              }
                              disabled={ro}
                              className="h-8 min-w-[100px] px-2.5 text-xs"
                            >
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              placeholder="Remarks (optional)"
                              value={remarksByTask[row.key] || ""}
                              readOnly={ro}
                              onChange={(e) => setRemarksByTask((prev) => ({ ...prev, [row.key]: e.target.value }))}
                              className="h-8 min-w-[200px] px-2.5 text-xs"
                            />
                          </td>
                        </tr>
                        {isRoundsExpandable && expandedRoundsCentre && (
                          <tr className="border-t border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30">
                            <td colSpan={4} className="px-2 py-2">
                              <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950">
                                <div className="mb-2 flex items-center justify-between">
                                  <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Rounds details</div>
                                  {!ro && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRoundsPlanRows((prev) => [...prev, newRoundsPlanRow()])
                                      }
                                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-950/40"
                                      aria-label="Add row"
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
                                  {roundsPlanRows.map((plan) => (
                                    <Fragment key={plan.id}>
                                      <Input
                                        placeholder="Name"
                                        value={plan.name}
                                        readOnly={ro}
                                        onChange={(e) =>
                                          setRoundsPlanRows((prev) =>
                                            prev.map((p) => (p.id === plan.id ? { ...p, name: e.target.value } : p))
                                          )
                                        }
                                        className="h-8 px-2.5 text-xs"
                                      />
                                      <Input
                                        type="time"
                                        value={plan.time}
                                        readOnly={ro}
                                        onChange={(e) =>
                                          setRoundsPlanRows((prev) =>
                                            prev.map((p) => (p.id === plan.id ? { ...p, time: e.target.value } : p))
                                          )
                                        }
                                        className="h-8 px-2.5 text-xs"
                                      />
                                      <Input
                                        placeholder="Room no."
                                        value={plan.roomNo}
                                        readOnly={ro}
                                        onChange={(e) =>
                                          setRoundsPlanRows((prev) =>
                                            prev.map((p) => (p.id === plan.id ? { ...p, roomNo: e.target.value } : p))
                                          )
                                        }
                                        className="h-8 px-2.5 text-xs"
                                      />
                                      <Input
                                        placeholder="Child"
                                        value={plan.child}
                                        readOnly={ro}
                                        onChange={(e) =>
                                          setRoundsPlanRows((prev) =>
                                            prev.map((p) => (p.id === plan.id ? { ...p, child: e.target.value } : p))
                                          )
                                        }
                                        className="h-8 px-2.5 text-xs"
                                      />
                                      <Input
                                        placeholder="Activity"
                                        value={plan.activity}
                                        readOnly={ro}
                                        onChange={(e) =>
                                          setRoundsPlanRows((prev) =>
                                            prev.map((p) => (p.id === plan.id ? { ...p, activity: e.target.value } : p))
                                          )
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
            <div className="mt-3 flex justify-end">
              {!ro && (
                <Button size="sm" variant="gradient" onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving…" : "Save coordinator sheet"}
                </Button>
              )}
            </div>
          </div>

          {message && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                message.type === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
