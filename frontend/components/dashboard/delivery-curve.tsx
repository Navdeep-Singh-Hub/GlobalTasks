"use client";

import { SurfacePanel } from "@/components/ui/surface-panel";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

type Point = { label: string; planned: number; completed: number };

const AreaChartBlock = dynamic(
  () =>
    import("recharts").then(({ Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis }) => {
      function Inner({ data }: { data: Point[] }) {
        return (
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
        );
      }
      return Inner;
    }),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" /> }
);

export function DeliveryCurve({ data, planned, completed }: { data: Point[]; planned: number; completed: number }) {
  const pct = planned > 0 ? Math.round((completed / planned) * 100) : 0;

  return (
    <SurfacePanel chip="Delivery curve" title="Planned vs completed" variant="elevated">
      <p className="-mt-2 mb-4 text-xs text-zinc-500">Six-month momentum view for the selected period.</p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-xl border border-emerald-200/60 bg-emerald-50/80 px-4 py-2 text-center dark:border-emerald-900/40 dark:bg-emerald-950/30"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Completed</div>
          <div className="mt-0.5 text-lg font-bold text-emerald-600">{completed}</div>
        </motion.div>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-brand-200/60 bg-brand-50/80 px-4 py-2 text-center dark:border-brand-900/40 dark:bg-brand-950/30"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">Planned</div>
          <div className="mt-0.5 text-lg font-bold text-brand-600">{planned}</div>
        </motion.div>
        <div className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {pct}% delivery rate
        </div>
      </div>

      <div className="h-[220px] w-full min-w-0 sm:h-[260px]">
        <AreaChartBlock data={data} />
      </div>
    </SurfacePanel>
  );
}
