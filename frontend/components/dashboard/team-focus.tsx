"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { ROLE_LABELS, USER_ROLES, type Role } from "@/lib/roles";

type Member = {
  user: { _id: string; name: string; email: string; role: string; title?: string };
  total: number;
  pending: number;
  overdue: number;
  completed: number;
  completion: number;
};

type FilterKey = "all" | Role;

export function TeamFocus({ members }: { members: Member[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [open, setOpen] = useState(false);

  const list = useMemo(() => members.filter((m) => filter === "all" || m.user.role === filter), [members, filter]);

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

      <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {list.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-zinc-500">No team members for this filter.</div>}
        {list.map((m) => (
          <div key={m.user._id} className="group rounded-xl border border-zinc-100 bg-gradient-to-r from-white to-zinc-50/50 p-3 transition-all hover:border-brand-200 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-brand">
                {m.user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{m.user.name}</div>
                  <div className="text-[11px] font-bold text-zinc-600">{m.completion}%</div>
                </div>
                <div className="text-[10.5px] text-zinc-500">{m.total} tasks · {m.completion}% completion</div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${Math.max(2, Math.min(100, m.completion))}%` }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
