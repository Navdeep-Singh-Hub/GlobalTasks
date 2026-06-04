"use client";

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type MissedRecord = {
  _id: string;
  taskTitle: string;
  taskType: string;
  occurrenceDueDate: string;
  submissionRemarks?: string;
};

function fmt(dt: string) {
  const d = new Date(dt);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function MissedOccurrencesPanel() {
  const [records, setRecords] = useState<MissedRecord[]>([]);

  useEffect(() => {
    api<{ records: MissedRecord[] }>("/tasks/my-missed-occurrences")
      .then((d) => setRecords(d.records || []))
      .catch(() => setRecords([]));
  }, []);

  if (!records.length) return null;

  return (
    <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
      <h3 className="text-sm font-bold text-violet-900 dark:text-violet-100">Not done (past days)</h3>
      <p className="mt-1 text-xs text-violet-800/80 dark:text-violet-200/80">
        These daily occurrences were not completed before the day ended. Only today&apos;s task appears above.
      </p>
      <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs">
        {records.map((r) => (
          <li
            key={r._id}
            className="rounded-lg border border-violet-200/60 bg-white/80 px-3 py-2 dark:border-violet-800 dark:bg-zinc-950/60"
          >
            <div className="font-semibold text-zinc-800 dark:text-zinc-100">{r.taskTitle}</div>
            <div className="mt-0.5 text-zinc-500">
              Due {fmt(r.occurrenceDueDate)} · {r.taskType}
            </div>
            {r.submissionRemarks ? (
              <div className="mt-1 text-violet-800 dark:text-violet-200">{r.submissionRemarks}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
