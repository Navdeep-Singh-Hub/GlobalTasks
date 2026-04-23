"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { name: string; Completed: number; Pending: number; Overdue: number };

export function TeamThroughputChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="#eef2f7" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
        <Bar dataKey="Completed" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
        <Bar dataKey="Pending" stackId="a" fill="#f59e0b" />
        <Bar dataKey="Overdue" stackId="a" fill="#ef4444" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
