/** Parses remarks stored as JSON on supervisor daily sheet tasks (observe therapy, therapy plan, alternative session). */

export type SupervisorTherapyPlanRow = {
  name?: string;
  time?: string;
  roomNo?: string;
  child?: string;
  activity?: string;
};

export type StructuredSupervisorRemarks = {
  remarks?: string;
  therapistName?: string;
  patientName?: string;
  dateFrom?: string;
  dateTo?: string;
  therapyPlanRows?: SupervisorTherapyPlanRow[];
};

export function parseStructuredSupervisorRemarks(raw: string): StructuredSupervisorRemarks | null {
  const s = String(raw ?? "").trim();
  if (!s.startsWith("{")) return null;
  try {
    const j = JSON.parse(s) as unknown;
    if (!j || typeof j !== "object") return null;
    const o = j as Record<string, unknown>;
    const therapyPlanRows = Array.isArray(o.therapyPlanRows)
      ? (o.therapyPlanRows as Record<string, unknown>[]).map((r) => ({
          name: String(r?.name ?? ""),
          time: String(r?.time ?? ""),
          roomNo: String(r?.roomNo ?? ""),
          child: String(r?.child ?? ""),
          activity: String(r?.activity ?? ""),
        }))
      : [];
    return {
      remarks: typeof o.remarks === "string" ? o.remarks : "",
      therapistName: typeof o.therapistName === "string" ? o.therapistName : "",
      patientName: typeof o.patientName === "string" ? o.patientName : "",
      dateFrom: typeof o.dateFrom === "string" ? o.dateFrom : "",
      dateTo: typeof o.dateTo === "string" ? o.dateTo : "",
      therapyPlanRows,
    };
  } catch {
    return null;
  }
}

function rowHasTherapyData(r: SupervisorTherapyPlanRow) {
  return (
    String(r.name || "").trim() ||
    String(r.time || "").trim() ||
    String(r.roomNo || "").trim() ||
    String(r.child || "").trim() ||
    String(r.activity || "").trim()
  );
}

/** True when structured payload has nothing meaningful to show (avoid empty boxes). */
export function structuredSupervisorRemarksIsEmpty(p: StructuredSupervisorRemarks): boolean {
  const note = String(p.remarks || "").trim();
  const th = String(p.therapistName || "").trim();
  const pt = String(p.patientName || "").trim();
  const df = String(p.dateFrom || "").trim();
  const dt = String(p.dateTo || "").trim();
  const rows = (p.therapyPlanRows || []).filter(rowHasTherapyData);
  return !note && !th && !pt && !df && !dt && rows.length === 0;
}

export function filterFilledTherapyRows(rows: SupervisorTherapyPlanRow[] | undefined): SupervisorTherapyPlanRow[] {
  return (rows || []).filter(rowHasTherapyData);
}

export type SupervisorSheetEntry = {
  taskKey: string;
  status?: "yes" | "no" | string;
  remarks?: string;
};

const THERAPY_PLAN_CHECK_KEY = "therapy-plan-check";
const SUPERVISOR_ROUND_NOTES_KEY = "supervisor-round-notes";

function entryHasTherapyPlanRows(remarks: string): boolean {
  const parsed = parseStructuredSupervisorRemarks(remarks);
  if (!parsed) return false;
  return filterFilledTherapyRows(parsed.therapyPlanRows).length > 0;
}

/**
 * Older supervisor fill UI swapped labels for therapy-plan-check vs supervisor-round-notes,
 * so therapy plan rows were stored on the wrong taskKey. Swap those two entries when detected.
 */
export function normalizeLegacySupervisorSheetEntries(entries: SupervisorSheetEntry[]): SupervisorSheetEntry[] {
  if (!entries.length) return entries;

  const list = entries.map((e) => ({
    taskKey: String(e.taskKey || "").trim(),
    status: String(e.status || "").toLowerCase() === "yes" ? ("yes" as const) : ("no" as const),
    remarks: String(e.remarks ?? ""),
  }));

  const iTpc = list.findIndex((e) => e.taskKey === THERAPY_PLAN_CHECK_KEY);
  if (iTpc < 0) return list;

  const tpc = list[iTpc];
  const iSrn = list.findIndex((e) => e.taskKey === SUPERVISOR_ROUND_NOTES_KEY);
  const srn =
    iSrn >= 0
      ? list[iSrn]
      : { taskKey: SUPERVISOR_ROUND_NOTES_KEY, status: "no" as const, remarks: "" };

  const therapyOnTpc = entryHasTherapyPlanRows(tpc.remarks);
  const therapyOnSrn = entryHasTherapyPlanRows(srn.remarks);
  if (!therapyOnTpc || therapyOnSrn) return list;

  list[iTpc] = { taskKey: THERAPY_PLAN_CHECK_KEY, status: srn.status, remarks: srn.remarks };
  if (iSrn >= 0) {
    list[iSrn] = { taskKey: SUPERVISOR_ROUND_NOTES_KEY, status: tpc.status, remarks: tpc.remarks };
  } else {
    list.push({ taskKey: SUPERVISOR_ROUND_NOTES_KEY, status: tpc.status, remarks: tpc.remarks });
  }

  return list;
}
