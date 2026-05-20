/** Normalize supervisor sheet entries saved while task labels were swapped on the fill form. */

function parseStructuredRemarks(raw) {
  const s = String(raw ?? "").trim();
  if (!s.startsWith("{")) return null;
  try {
    const j = JSON.parse(s);
    if (!j || typeof j !== "object") return null;
    return j;
  } catch {
    return null;
  }
}

function rowHasTherapyData(r) {
  if (!r || typeof r !== "object") return false;
  return (
    String(r.name || "").trim() ||
    String(r.time || "").trim() ||
    String(r.roomNo || "").trim() ||
    String(r.child || "").trim() ||
    String(r.activity || "").trim()
  );
}

function remarksHaveTherapyPlanRows(remarks) {
  const parsed = parseStructuredRemarks(remarks);
  if (!parsed || !Array.isArray(parsed.therapyPlanRows)) return false;
  return parsed.therapyPlanRows.some(rowHasTherapyData);
}

const THERAPY_PLAN_CHECK_KEY = "therapy-plan-check";
const SUPERVISOR_ROUND_NOTES_KEY = "supervisor-round-notes";

/**
 * Legacy bug: therapy plan rows were stored under `therapy-plan-check` while simple yes/no
 * for "Therapy plan check" lived under `supervisor-round-notes`. Swap those two entries when detected.
 */
export function normalizeLegacySupervisorSheetEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) return entries || [];

  const list = entries.map((e) => ({
    taskKey: String(e?.taskKey || "").trim(),
    status: String(e?.status || "").toLowerCase() === "yes" ? "yes" : "no",
    remarks: String(e?.remarks || "").trim(),
  }));

  const iTpc = list.findIndex((e) => e.taskKey === THERAPY_PLAN_CHECK_KEY);
  if (iTpc < 0) return list;

  const tpc = list[iTpc];
  const iSrn = list.findIndex((e) => e.taskKey === SUPERVISOR_ROUND_NOTES_KEY);
  const srn =
    iSrn >= 0
      ? list[iSrn]
      : { taskKey: SUPERVISOR_ROUND_NOTES_KEY, status: "no", remarks: "" };

  const therapyOnTpc = remarksHaveTherapyPlanRows(tpc.remarks);
  const therapyOnSrn = remarksHaveTherapyPlanRows(srn.remarks);
  if (!therapyOnTpc || therapyOnSrn) return list;

  const swappedTpc = {
    taskKey: THERAPY_PLAN_CHECK_KEY,
    status: srn.status,
    remarks: srn.remarks,
  };
  const swappedSrn = {
    taskKey: SUPERVISOR_ROUND_NOTES_KEY,
    status: tpc.status,
    remarks: tpc.remarks,
  };

  list[iTpc] = swappedTpc;
  if (iSrn >= 0) list[iSrn] = swappedSrn;
  else list.push(swappedSrn);

  return list;
}
