"use client";

import {
  filterFilledTherapyRows,
  parseStructuredSupervisorRemarks,
  structuredSupervisorRemarksIsEmpty,
} from "@/lib/supervisor-sheet-remarks";

/** Read-only remarks for supervisor sheet rows (plain text or structured JSON saved from daily sheet). */
export function SupervisorRemarksDisplay({ remarks }: { remarks?: string }) {
  const raw = String(remarks ?? "").trim();
  if (!raw) return <span className="text-zinc-400">—</span>;

  const structured = parseStructuredSupervisorRemarks(raw);
  if (structured && !structuredSupervisorRemarksIsEmpty(structured)) {
    const therapyRows = filterFilledTherapyRows(structured.therapyPlanRows);
    const note = String(structured.remarks || "").trim();
    const therapist = String(structured.therapistName || "").trim();
    const patient = String(structured.patientName || "").trim();
    const df = String(structured.dateFrom || "").trim();
    const dt = String(structured.dateTo || "").trim();

    return (
      <div className="max-w-[min(96vw,720px)] space-y-2 text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-100">
        {note ? (
          <p className="whitespace-pre-wrap rounded-md border border-zinc-100 bg-zinc-50/90 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="font-semibold text-zinc-500">Notes: </span>
            {note}
          </p>
        ) : null}
        {(therapist || patient) && (
          <div className="space-y-0.5">
            {therapist ? (
              <div>
                <span className="font-semibold text-zinc-500">Therapist: </span>
                {therapist}
              </div>
            ) : null}
            {patient ? (
              <div>
                <span className="font-semibold text-zinc-500">Patient: </span>
                {patient}
              </div>
            ) : null}
          </div>
        )}
        {(df || dt) && (
          <div className="text-zinc-600 dark:text-zinc-300">
            <span className="font-semibold text-zinc-500">Period: </span>
            {df || "—"} → {dt || "—"}
          </div>
        )}
        {therapyRows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
            <table className="w-full min-w-[520px] text-left">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">Time</th>
                  <th className="px-2 py-1.5">Room</th>
                  <th className="px-2 py-1.5">Child</th>
                  <th className="px-2 py-1.5">Activity</th>
                </tr>
              </thead>
              <tbody>
                {therapyRows.map((r, i) => (
                  <tr key={`${r.name}-${r.child}-${i}`} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-1.5 align-top">{String(r.name || "").trim() || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 align-top">{String(r.time || "").trim() || "—"}</td>
                    <td className="px-2 py-1.5 align-top">{String(r.roomNo || "").trim() || "—"}</td>
                    <td className="px-2 py-1.5 align-top">{String(r.child || "").trim() || "—"}</td>
                    <td className="px-2 py-1.5 align-top">{String(r.activity || "").trim() || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    );
  }

  if (structured && structuredSupervisorRemarksIsEmpty(structured)) {
    const looksLikeAppPayload =
      /"remarks"\s*:|"therapistName"\s*:|"therapyPlanRows"\s*:/.test(raw) ||
      /"patientName"\s*:|"dateFrom"\s*:|"dateTo"\s*:/.test(raw);
    if (looksLikeAppPayload) return <span className="text-zinc-400">—</span>;
    return <span className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">{raw}</span>;
  }

  return <span className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">{raw}</span>;
}
