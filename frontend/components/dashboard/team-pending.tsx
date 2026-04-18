"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

type Member = {
  user: { _id: string; name: string };
  pending: number;
  overdue: number;
  oneTime: number;
  daily: number;
  recurring: number;
};

const PAGE = 3;

export function TeamPending({ members }: { members: Member[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(members.length / PAGE));
  const current = members.slice(page * PAGE, page * PAGE + PAGE);
  const shown = current.reduce((a, b) => a + b.pending, 0);
  const overdueShown = current.reduce((a, b) => a + b.overdue, 0);

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between">
        <div>
          <div className="chip border border-zinc-200 bg-zinc-50 text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            Team pending
          </div>
          <h3 className="mt-3 text-[20px] font-bold tracking-tight">Pending work by member</h3>
          <p className="mt-1 text-xs text-zinc-500">A quick view of today&apos;s pending and overdue items.</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-gradient-to-r from-brand-50/70 to-accent-cyan/10 p-3 dark:from-brand-900/20 dark:to-accent-cyan/10">
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-600">
          <Users className="h-3.5 w-3.5" /> Pending work by member
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">{members.length} members</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-white p-2.5 text-center dark:bg-zinc-900">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Shown pending</div>
            <div className="mt-0.5 text-lg font-bold text-amber-600">{shown}</div>
          </div>
          <div className="rounded-lg bg-white p-2.5 text-center dark:bg-zinc-900">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Shown overdue</div>
            <div className="mt-0.5 text-lg font-bold text-rose-600">{overdueShown}</div>
          </div>
          <div className="rounded-lg bg-white p-2.5 text-center dark:bg-zinc-900">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Page</div>
            <div className="mt-0.5 text-lg font-bold">{page + 1}/{totalPages}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {current.map((m) => (
          <div key={m.user._id} className="rounded-xl border border-zinc-100 p-3.5 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gradient text-[11px] font-bold text-white shadow-brand">
                  {m.user.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-sm font-semibold">{m.user.name}</div>
              </div>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                {m.pending} active
              </span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">{m.pending} pending, {m.overdue} overdue</div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-brand-gradient"
                style={{ width: `${Math.min(100, (m.pending + m.overdue) * 8)}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10.5px]">
              <div className="rounded-lg border border-zinc-100 p-1.5 dark:border-zinc-800">
                <div className="font-semibold text-zinc-500">One-time</div>
                <div className="text-sm font-bold">{m.oneTime}</div>
              </div>
              <div className="rounded-lg border border-zinc-100 p-1.5 dark:border-zinc-800">
                <div className="font-semibold text-zinc-500">Daily</div>
                <div className="text-sm font-bold">{m.daily}</div>
              </div>
              <div className="rounded-lg border border-zinc-100 p-1.5 dark:border-zinc-800">
                <div className="font-semibold text-zinc-500">Recurring</div>
                <div className="text-sm font-bold">{m.recurring}</div>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                ● Pending {m.pending}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                ● Overdue {m.overdue}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 disabled:opacity-40 dark:border-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-[11px] text-zinc-500">Page {page + 1} of {totalPages}</div>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 disabled:opacity-40 dark:border-zinc-700"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
