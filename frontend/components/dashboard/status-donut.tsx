"use client";

import { AnimatedProgressBar } from "@/components/ui/progress-ring";
import { SurfacePanel } from "@/components/ui/surface-panel";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

const COLORS: Record<string, string> = {
  pending: "#f5b614",
  in_progress: "#3b82f6",
  awaiting_approval: "#8b5cf6",
  completed: "#10b981",
  overdue: "#ef4444",
};

const LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  awaiting_approval: "Awaiting approval",
  completed: "Completed",
  overdue: "Overdue",
};

const StatusDonutChart = dynamic(
  () =>
    import("recharts").then(({ Cell, Pie, PieChart, ResponsiveContainer }) => {
      function Inner({ data }: { data: { name: string; value: number }[] }) {
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.length ? data : [{ name: "empty", value: 1 }]}
                dataKey="value"
                innerRadius={62}
                outerRadius={88}
                paddingAngle={data.length > 1 ? 3 : 0}
                strokeWidth={0}
              >
                {(data.length ? data : [{ name: "empty", value: 1 }]).map((d, i) => (
                  <Cell key={i} fill={COLORS[d.name] || "#e2e8f0"} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        );
      }
      return Inner;
    }),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" /> }
);

export function StatusDonut({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <SurfacePanel
      chip="Status breakdown"
      title="Live task states"
      variant="gradient-border"
      action={
        <div className="rounded-full bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-900">
          {total} total
        </div>
      }
    >
      <div className="grid min-w-0 items-center gap-4 md:grid-cols-[220px_1fr]">
        <div className="relative mx-auto h-[200px] w-full max-w-[240px] min-w-0 md:mx-0 md:max-w-none">
          <StatusDonutChart data={data} />
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          >
            <div className="text-2xl font-bold tracking-tight">{total}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Tasks</div>
          </motion.div>
        </div>

        <div className="space-y-2">
          {(data.length ? data : []).map((d, i) => {
            const pct = Math.round((d.value / total) * 1000) / 10;
            return (
              <motion.div
                key={d.name}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-zinc-100 p-2.5 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between text-[12px] font-semibold">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ background: COLORS[d.name] || "#94a3b8" }} />
                    {LABELS[d.name] || d.name}
                  </span>
                  <span>{d.value}</span>
                </div>
                <AnimatedProgressBar value={pct} tone={d.name === "completed" ? "emerald" : d.name === "overdue" ? "rose" : "brand"} className="mt-1.5" />
                <div className="mt-1 text-[10px] text-zinc-500">{pct}% of status total</div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </SurfacePanel>
  );
}
