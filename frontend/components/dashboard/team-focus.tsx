"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { ROLE_LABELS, USER_ROLES, type Role } from "@/lib/roles";
import { ApiError, api } from "@/lib/api";

type Member = {
  user: { _id: string; name: string; email: string; role: string; title?: string };
  total: number;
  pending: number;
  overdue: number;
  completed: number;
  completion: number;
};

type FilterKey = "all" | Role;

type TaskLite = { _id: string; title: string; dueDate: string | null; status?: string };

export function TeamFocus({ members }: { members: Member[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completedByUser, setCompletedByUser] = useState<Record<string, TaskLite[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const list = useMemo(() => members.filter((m) => filter === "all" || m.user.role === filter), [members, filter]);

  const sortedList = useMemo(() => {
    return [...list].sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.completion !== a.completion) return b.completion - a.completion;
      return a.user.name.localeCompare(b.user.name, undefined, { sensitivity: "base" });
    });
  }, [list]);

  useEffect(() => {
    setExpandedId(null);
    setCompletedByUser({});
    setLoadErr(null);
  }, [filter, members]);

  const fetchCompleted = useCallback(async (userId: string) => {
    setLoadingId(userId);
    setLoadErr(null);
    try {
      const d = await api<{ completed: TaskLite[] }>(`/dashboard/member-tasks?assigneeId=${encodeURIComponent(userId)}`);
      setCompletedByUser((prev) => ({ ...prev, [userId]: d.completed || [] }));
    } catch (e) {
      setLoadErr(e instanceof ApiError ? e.message : "Could not load tasks.");
    } finally {
      setLoadingId(null);
    }
  }, []);

  function toggleRow(userId: string) {
    if (expandedId === userId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(userId);
    if (!completedByUser[userId]) void fetchCompleted(userId);
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
            <Users className="h-3 w-3" />
            Team lens
          </div>
          <h3 className="mt-3 text-[20px] font-bold tracking-tight">Team performance focus</h3>
          <p className="mt-1 text-xs text-zinc-500">Switch between team members and inspect the current rhythm without leaving the dashboard.</p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold capitalize dark:border-zinc-700 dark:bg-zinc-900"
          >
            <Users className="h-3.5 w-3.5" /> {filter === "all" ? "All team" : ROLE_LABELS[filter]}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {open && (
            <div className="absolute right-0 top-11 z-20 min-w-[10rem] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              {(["all", ...USER_ROLES] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => { setFilter(k); setOpen(false); }}
                  className="flex w-full px-3 py-2 text-left text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  {k === "all" ? "All team" : ROLE_LABELS[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loadErr && (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
          {loadErr}
        </div>
      )}

      <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {sortedList.length === 0 && (
          <div className="rounded-xl border border-dashed p-6 text-center text-xs text-zinc-500">No team members for this filter.</div>
        )}
        {sortedList.map((m) => {
          const isOpen = expandedId === m.user._id;
          const done = completedByUser[m.user._id];
          const loading = loadingId === m.user._id;
          return (
            <div key={m.user._id} className="rounded-xl border border-zinc-100 bg-gradient-to-r from-white to-zinc-50/50 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
              <button
                type="button"
                onClick={() => toggleRow(m.user._id)}
                className="group flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition-all hover:border-brand-200 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:hover:bg-zinc-900/80"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-brand">
                  {(m.user.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                      )}
                      <div className="truncate text-sm font-semibold">{m.user.name}</div>
                    </div>
                    <div className="shrink-0 text-[11px] font-bold text-zinc-600">{m.completion}%</div>
                  </div>
                  <div className="mt-0.5 pl-5 text-[10.5px] text-zinc-500">
                    {m.total} tasks · {m.completion}% completion
                    {m.completed > 0 && <span className="text-zinc-400"> · {m.completed} done</span>}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${Math.max(2, Math.min(100, m.completion))}%` }} />
                  </div>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-zinc-100 px-3 pb-3 pt-2 dark:border-zinc-800">
                  {loading && <div className="text-[11px] text-zinc-500">Loading completed tasks…</div>}
                  {!loading && done && done.length === 0 && (
                    <div className="text-[11px] text-zinc-500">No completed tasks yet.</div>
                  )}
                  {!loading && done && done.length > 0 && (
                    <ul className="max-h-48 space-y-1.5 overflow-y-auto text-[11px]">
                      <li className="font-semibold uppercase tracking-wide text-zinc-400">Completed</li>
                      {done.map((t) => (
                        <li key={t._id} className="flex items-start justify-between gap-2 rounded-lg bg-zinc-50/90 px-2 py-1.5 dark:bg-zinc-900/60">
                          <span className="font-medium text-zinc-800 dark:text-zinc-100">{t.title}</span>
                          <span className="shrink-0 text-zinc-500">Due {formatDue(t.dueDate)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
