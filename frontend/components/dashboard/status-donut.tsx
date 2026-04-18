"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

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

export function StatusDonut({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between">
        <div>
          <div className="chip border border-zinc-200 bg-zinc-50 text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            Status breakdown
          </div>
          <h3 className="mt-3 text-[20px] font-bold tracking-tight">Live task states</h3>
        </div>
        <div className="rounded-full bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-900">
          {total} total
        </div>
      </div>

      <div className="mt-4 grid items-center gap-4 md:grid-cols-[220px_1fr]">
        <div className="relative h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.length ? data : [{ name: "empty", value: 1 }]}
                dataKey="value"
                innerRadius={62}
                outerRadius={88}
                paddingAngle={data.length > 1 ? 2 : 0}
                strokeWidth={0}
              >
                {(data.length ? data : [{ name: "empty", value: 1 }]).map((d, i) => (
                  <Cell key={i} fill={COLORS[d.name] || "#e2e8f0"} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-bold tracking-tight">{total}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Tasks</div>
          </div>
        </div>

        <div className="space-y-2">
          {(data.length ? data : []).map((d) => {
            const pct = Math.round((d.value / total) * 1000) / 10;
            return (
              <div key={d.name} className="rounded-xl border border-zinc-100 p-2.5 dark:border-zinc-800">
                <div className="flex items-center justify-between text-[12px] font-semibold">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[d.name] || "#94a3b8" }} />
                    {LABELS[d.name] || d.name}
                  </span>
                  <span>{d.value}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: COLORS[d.name] || "#94a3b8" }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">{pct}% of status total</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
