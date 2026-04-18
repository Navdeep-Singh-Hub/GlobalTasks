"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { label: string; planned: number; completed: number };

export function DeliveryCurve({ data, planned, completed }: { data: Point[]; planned: number; completed: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="chip border border-zinc-200 bg-zinc-50 text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            Delivery curve
          </div>
          <h3 className="mt-3 text-[20px] font-bold tracking-tight">Planned vs completed</h3>
          <p className="mt-1 text-xs text-zinc-500">Six-month momentum view for the selected period.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-2 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Completed</div>
            <div className="mt-0.5 text-lg font-bold text-emerald-600">{completed}</div>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-2 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Planned</div>
            <div className="mt-0.5 text-lg font-bold text-brand-600">{planned}</div>
          </div>
        </div>
      </div>

      <div className="mt-5 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id="plannedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1e8ee1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#1e8ee1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef2f7" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
              formatter={(v, n) => [String(v), String(n).replace(/^\w/, (c) => c.toUpperCase())]}
            />
            <Area type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2.5} fill="url(#completedFill)" />
            <Area type="monotone" dataKey="planned" stroke="#1e8ee1" strokeWidth={2.5} fill="url(#plannedFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
