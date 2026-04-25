"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { ApiError, api } from "@/lib/api";

type Member = {
  user: { _id: string; name: string };
  pending: number;
  overdue: number;
  oneTime: number;
  daily: number;
  recurring: number;
};

type TaskLite = { _id: string; title: string; dueDate: string | null; status?: string };

const PAGE = 3;

export function TeamPending({ members }: { members: Member[] }) {
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tasksByUser, setTasksByUser] = useState<Record<string, { pending: TaskLite[]; overdue: TaskLite[] }>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const wb = b.pending + b.overdue;
      const wa = a.pending + a.overdue;
      if (wb !== wa) return wb - wa;
      if (b.pending !== a.pending) return b.pending - a.pending;
      return a.user.name.localeCompare(b.user.name, undefined, { sensitivity: "base" });
    });
  }, [members]);

  useEffect(() => {
    setPage(0);
    setExpandedId(null);
    setTasksByUser({});
    setLoadErr(null);
  }, [members]);

  const totalPages = Math.max(1, Math.ceil(sortedMembers.length / PAGE));
  const current = sortedMembers.slice(page * PAGE, page * PAGE + PAGE);
  const shown = current.reduce((a, b) => a + b.pending, 0);
  const overdueShown = current.reduce((a, b) => a + b.overdue, 0);

  const fetchTasks = useCallback(async (userId: string) => {
    setLoadingId(userId);
    setLoadErr(null);
    try {
      const d = await api<{ pending: TaskLite[]; overdue: TaskLite[] }>(
        `/dashboard/member-tasks?assigneeId=${encodeURIComponent(userId)}`
      );
      setTasksByUser((prev) => ({ ...prev, [userId]: { pending: d.pending || [], overdue: d.overdue || [] } }));
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not load tasks.");
    } finally {
      setLoadingId(null);
    }
  }, []);

  function toggleExpand(userId: string) {
    if (expandedId === userId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(userId);
    if (!tasksByUser[userId]) void fetchTasks(userId);
  }

  function formatDue(iso: string | null) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "—";
    }
  }

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
        <div className="mt-1 text-[11px] text-zinc-500">{sortedMembers.length} members</div>
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

      {loadErr && (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
          {loadErr}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {current.map((m) => {
          const isOpen = expandedId === m.user._id;
          const lists = tasksByUser[m.user._id];
          const loading = loadingId === m.user._id;
          return (
            <div key={m.user._id} className="rounded-xl border border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => toggleExpand(m.user._id)}
                className="w-full rounded-xl p-3.5 text-left transition-colors hover:bg-zinc-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:hover:bg-zinc-900/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-[11px] font-bold text-white shadow-brand">
                      {(m.user.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                        )}
                        <div className="truncate text-sm font-semibold">{m.user.name}</div>
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                    {m.pending + m.overdue} active
                  </span>
                </div>
                <div className="mt-1 pl-9 text-[11px] text-zinc-500">{m.pending} pending, {m.overdue} overdue</div>
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
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                    ● Pending {m.pending}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                    ● Overdue {m.overdue}
                  </span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-zinc-100 px-3 pb-3 pt-2 dark:border-zinc-800">
                  {loading && <div className="text-[11px] text-zinc-500">Loading task names…</div>}
                  {!loading && lists && (
                    <div className="max-h-56 space-y-3 overflow-y-auto text-[11px]">
                      <div>
                        <div className="mb-1 font-semibold uppercase tracking-wide text-amber-700/90 dark:text-amber-300/90">Pending</div>
                        {lists.pending.length === 0 ? (
                          <div className="text-zinc-500">None</div>
                        ) : (
                          <ul className="space-y-1">
                            {lists.pending.map((t) => (
                              <li
                                key={`${t._id}-pending`}
                                className="flex items-start justify-between gap-2 rounded-lg bg-amber-50/60 px-2 py-1.5 dark:bg-amber-950/20"
                              >
                                <span className="font-medium text-zinc-800 dark:text-zinc-100">{t.title}</span>
                                <span className="shrink-0 text-zinc-500">Due {formatDue(t.dueDate)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <div className="mb-1 font-semibold uppercase tracking-wide text-rose-700/90 dark:text-rose-300/90">Overdue</div>
                        {lists.overdue.length === 0 ? (
                          <div className="text-zinc-500">None</div>
                        ) : (
                          <ul className="space-y-1">
                            {lists.overdue.map((t) => (
                              <li
                                key={`${t._id}-overdue`}
                                className="flex items-start justify-between gap-2 rounded-lg bg-rose-50/60 px-2 py-1.5 dark:bg-rose-950/20"
                              >
                                <span className="font-medium text-zinc-800 dark:text-zinc-100">{t.title}</span>
                                <span className="shrink-0 text-zinc-500">Due {formatDue(t.dueDate)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
