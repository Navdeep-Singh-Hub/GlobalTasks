"use client";

import { api } from "@/lib/api";
import { formatRoleLine } from "@/lib/roles";
import { Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Member = {
  user: { _id: string; name: string; role: string; executorKind?: string };
  total: number;
  pending: number;
  overdue: number;
  completed: number;
  completion: number;
};

export default function PerformancePage() {
  const [data, setData] = useState<Member[]>([]);
  useEffect(() => {
    api<{ members: Member[] }>("/dashboard/team-performance").then((d) => setData(d.members)).catch(() => setData([]));
  }, []);

  const chartData = data.map((m) => ({
    name: m.user.name.split(" ")[0],
    Completed: m.completed,
    Pending: m.pending,
    Overdue: m.overdue,
  }));

  return (
    <div className="space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <Zap className="h-3 w-3" /> Analytics
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Performance</h1>
        <p className="mt-1 text-sm text-zinc-500">Throughput and reliability of each team member.</p>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#eef2f7" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="Completed" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Pending" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Overdue" stackId="a" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.map((m) => (
          <div key={m.user._id} className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white shadow-brand">
                {m.user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold">{m.user.name}</div>
                <div className="text-[10.5px] text-zinc-500">{formatRoleLine(m.user.role, m.user.executorKind)}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px]">
              <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900"><div className="font-semibold">Total</div><div className="text-sm font-bold">{m.total}</div></div>
              <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-900/30"><div className="font-semibold text-amber-600">Pending</div><div className="text-sm font-bold">{m.pending}</div></div>
              <div className="rounded-lg bg-rose-50 p-2 dark:bg-rose-900/30"><div className="font-semibold text-rose-600">Overdue</div><div className="text-sm font-bold">{m.overdue}</div></div>
              <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-900/30"><div className="font-semibold text-emerald-600">Done</div><div className="text-sm font-bold">{m.completed}</div></div>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${m.completion}%` }} />
            </div>
            <div className="mt-1 text-right text-[10.5px] font-semibold text-zinc-500">{m.completion}% completion</div>
          </div>
        ))}
      </div>
    </div>
  );
}
