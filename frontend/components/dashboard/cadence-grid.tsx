"use client";

import { AnimatedProgressBar } from "@/components/ui/progress-ring";
import { SurfacePanel } from "@/components/ui/surface-panel";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const ORDER = ["one_time", "daily", "weekly", "monthly", "quarterly", "yearly"] as const;
const LABEL: Record<string, string> = {
  one_time: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};
const ACCENT: Record<string, string> = {
  one_time: "bg-zinc-400",
  daily: "bg-emerald-500",
  weekly: "bg-sky-500",
  monthly: "bg-violet-500",
  quarterly: "bg-amber-500",
  yearly: "bg-rose-500",
  fortnightly: "bg-brand-500",
};

type Row = { _id: string; total: number; pending: number; completed: number };

export function CadenceGrid({ data }: { data: Row[] }) {
  const total = data.reduce((a, b) => a + b.total, 0) || 1;
  const byKey = new Map(data.map((d) => [d._id, d]));
  const rows = ORDER.map((k) => byKey.get(k) || { _id: k, total: 0, pending: 0, completed: 0 });

  return (
    <SurfacePanel
      chip="Task mix"
      title="Workload by cadence"
      action={<div className="text-[11px] text-zinc-500">{total} tasks across six cadences</div>}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((r, i) => {
          const pct = Math.round((r.total / total) * 1000) / 10;
          return (
            <motion.div
              key={r._id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
              className="group relative rounded-xl border border-zinc-100 bg-gradient-to-br from-white to-zinc-50/70 p-3.5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{LABEL[r._id]}</div>
                <span className={cn("h-2.5 w-2.5 rounded-full shadow-sm", ACCENT[r._id])} />
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">{pct}% of total workload</div>
              <div className="mt-3">
                <AnimatedProgressBar value={pct} tone={r._id === "daily" ? "emerald" : r._id === "quarterly" ? "amber" : "brand"} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-lg bg-white px-2 py-1 text-center shadow-sm dark:bg-zinc-900">
                  <div className="font-semibold text-zinc-500">Total</div>
                  <div className="text-sm font-bold">{r.total}</div>
                </div>
                <div className="rounded-lg bg-white px-2 py-1 text-center shadow-sm dark:bg-zinc-900">
                  <div className="font-semibold text-amber-600">Pending</div>
                  <div className="text-sm font-bold">{r.pending}</div>
                </div>
                <div className="rounded-lg bg-white px-2 py-1 text-center shadow-sm dark:bg-zinc-900">
                  <div className="font-semibold text-emerald-600">Done</div>
                  <div className="text-sm font-bold">{r.completed}</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </SurfacePanel>
  );
}
