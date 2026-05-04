"use client";

import {
  parseParentMeetingRemarks,
  parseRoundsOfCentreRemarks,
  parseSessionObservationRemarks,
} from "@/lib/coordinator-sheet-remarks";

const PARENT_STYLE_KEYS = new Set([
  "parent-meeting",
  "opd-meeting-parents",
  "new-parents-waiting-package",
  "parenting-session",
]);

function rowHasRoundsData(r: {
  name: string;
  time: string;
  roomNo: string;
  child: string;
  activity: string;
}) {
  return (
    r.name.trim() ||
    r.time.trim() ||
    r.roomNo.trim() ||
    r.child.trim() ||
    r.activity.trim()
  );
}

/** Renders coordinator sheet `remarks` for read-only views (reports, performance). */
export function CoordinatorRemarksDisplay({ taskKey, remarks }: { taskKey: string; remarks?: string }) {
  const raw = String(remarks ?? "").trim();
  if (!raw) return <span className="text-zinc-400">—</span>;

  if (PARENT_STYLE_KEYS.has(taskKey)) {
    const { children, note } = parseParentMeetingRemarks(raw);
    const hasChildren = children.some((c) => c.length > 0);
    if (!hasChildren && !note) {
      return <span className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{raw}</span>;
    }
    return (
      <div className="min-w-[180px] max-w-[min(92vw,480px)] space-y-2 text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-100">
        {hasChildren && (
          <div>
            <div className="mb-1 font-semibold uppercase tracking-wide text-zinc-500">Children</div>
            <ul className="list-inside list-disc space-y-0.5 text-zinc-800 dark:text-zinc-100">
              {children.filter(Boolean).map((c, i) => (
                <li key={`${c}-${i}`}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {note ? (
          <div>
            <div className="mb-1 font-semibold uppercase tracking-wide text-zinc-500">Remarks</div>
            <p className="whitespace-pre-wrap rounded-md border border-zinc-100 bg-zinc-50/90 px-2 py-1.5 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
              {note}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  if (taskKey === "rounds-of-centre") {
    const { note, rows } = parseRoundsOfCentreRemarks(raw);
    const filled = rows.filter(rowHasRoundsData);
    return (
      <div className="max-w-[min(96vw,720px)] space-y-2 text-[11px]">
        {filled.length > 0 ? (
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
              <tbody className="text-zinc-800 dark:text-zinc-100">
                {filled.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-1.5 align-top">{r.name.trim() || "—"}</td>
                    <td className="px-2 py-1.5 align-top whitespace-nowrap">{r.time.trim() || "—"}</td>
                    <td className="px-2 py-1.5 align-top">{r.roomNo.trim() || "—"}</td>
                    <td className="px-2 py-1.5 align-top">{r.child.trim() || "—"}</td>
                    <td className="px-2 py-1.5 align-top">{r.activity.trim() || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {note ? (
          <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold text-zinc-500">Note: </span>
            {note}
          </p>
        ) : null}
        {!filled.length && !note ? (
          <span className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{raw}</span>
        ) : null}
      </div>
    );
  }

  if (taskKey === "session-observation") {
    const { note, rows } = parseSessionObservationRemarks(raw);
    const filled = rows.filter((r) => r.childName.trim() || r.therapistName.trim() || r.rating !== "");
    return (
      <div className="max-w-[min(96vw,520px)] space-y-2 text-[11px]">
        {filled.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
            <table className="w-full min-w-[360px] text-left">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-1.5">Child</th>
                  <th className="px-2 py-1.5">Therapist</th>
                  <th className="px-2 py-1.5">Rating</th>
                </tr>
              </thead>
              <tbody className="text-zinc-800 dark:text-zinc-100">
                {filled.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-1.5">{r.childName.trim() || "—"}</td>
                    <td className="px-2 py-1.5">{r.therapistName.trim() || "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {r.rating === "" ? "—" : `${r.rating}/10`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {note ? (
          <p className="whitespace-pre-wrap rounded-md border border-zinc-100 bg-zinc-50/90 px-2 py-1.5 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
            <span className="font-semibold text-zinc-500">Note: </span>
            {note}
          </p>
        ) : null}
        {!filled.length && !note ? (
          <span className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{raw}</span>
        ) : null}
      </div>
    );
  }

  try {
    const j = JSON.parse(raw) as unknown;
    if (j && typeof j === "object") {
      return (
        <pre className="max-h-52 max-w-xl overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-2 text-[10px] leading-snug text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200">
          {JSON.stringify(j, null, 2)}
        </pre>
      );
    }
  } catch {
    /* plain text */
  }

  return <span className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">{raw}</span>;
}
