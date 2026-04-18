"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DeliveryCurve } from "@/components/dashboard/delivery-curve";
import { StatusDonut } from "@/components/dashboard/status-donut";
import { CadenceGrid } from "@/components/dashboard/cadence-grid";
import { TeamFocus } from "@/components/dashboard/team-focus";
import { TeamPending } from "@/components/dashboard/team-pending";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { CalendarDays, CheckCircle2, ListChecks, Sparkles, TriangleAlert, Timer, ChevronDown } from "lucide-react";

type Summary = {
  cards: { totalTasks: number; pending: number; completed: number; overdue: number; activeProjects: number; overduePct: number };
  byStatus: { name: string; value: number }[];
  byCadence: { _id: string; total: number; pending: number; completed: number }[];
  deliveryCurve: { label: string; planned: number; completed: number }[];
};
type TeamMember = {
  user: { _id: string; name: string; email: string; role: string };
  total: number;
  pending: number;
  overdue: number;
  completed: number;
  completion: number;
  oneTime: number;
  daily: number;
  recurring: number;
};
type ActivityItem = { _id: string; actorName?: string; message: string; taskTitle?: string; taskType?: string; createdAt: string };

export default function DashboardPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState<"month" | "all">("month");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    api<Summary>(`/dashboard/summary?scope=${scope}`).then(setSummary).catch(() => {});
    api<{ members: TeamMember[] }>("/dashboard/team-performance").then((d) => setTeam(d.members)).catch(() => setTeam([]));
    api<{ items: ActivityItem[] }>("/dashboard/activity?limit=10").then((d) => setActivity(d.items)).catch(() => setActivity([]));
  }, [scope]);

  const monthLabel = useMemo(() => new Date().toLocaleDateString([], { month: "long", year: "numeric" }), []);
  const plannedTotal = summary?.deliveryCurve.reduce((a, b) => a + b.planned, 0) || 0;
  const completedTotal = summary?.deliveryCurve.reduce((a, b) => a + b.completed, 0) || 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950 md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-gradient-soft blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-accent-cyan/10 blur-3xl" />

        <div className="relative grid gap-6 md:grid-cols-[1.35fr_1fr] md:items-end">
          <div>
            <div className="chip border border-zinc-200 bg-zinc-50 text-zinc-500">
              <Sparkles className="h-3 w-3" />
              Command center
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              Welcome back, <span className="bg-brand-gradient bg-clip-text text-transparent">{user?.name?.split(" ")[0] || "Admin"}</span>
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900">
                <CalendarDays className="h-3 w-3" /> {scope === "month" ? "Current month" : "All time"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold capitalize text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {user?.role}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4 shadow-card backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex items-center justify-between">
              <div className="chip bg-zinc-50 text-zinc-500">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                Quick filters
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900">
                <CalendarDays className="h-3 w-3" /> {scope === "month" ? "Current month" : "All time"}
              </div>
            </div>
            <div className="mt-3 inline-flex rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
              <button
                onClick={() => setScope("month")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${scope === "month" ? "bg-brand-gradient text-white shadow-brand" : "text-zinc-500"}`}
              >
                Current month
              </button>
              <button
                onClick={() => setScope("all")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${scope === "all" ? "bg-brand-gradient text-white shadow-brand" : "text-zinc-500"}`}
              >
                All time
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
              <span className="flex items-center gap-2 text-zinc-600">
                <CalendarDays className="h-3.5 w-3.5 text-brand-500" /> {monthLabel}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total tasks"
          value={summary?.cards.totalTasks ?? "—"}
          icon={ListChecks}
          tone="brand"
          trend="+100%"
          hint="All active work items in the selected scope"
        />
        <KpiCard
          label="Pending"
          value={summary?.cards.pending ?? "—"}
          icon={Timer}
          tone="amber"
          trend="+100%"
          hint="Tasks waiting for action"
        />
        <KpiCard
          label="Completed"
          value={summary?.cards.completed ?? "—"}
          icon={CheckCircle2}
          tone="emerald"
          trend="+0%"
          hint="Tasks delivered successfully"
        />
        <KpiCard
          label="Overdue"
          value={summary?.cards.overdue ?? "—"}
          icon={TriangleAlert}
          tone="rose"
          trend={summary ? `${summary.cards.overduePct}%` : "—"}
          hint={summary ? `${summary.cards.overduePct}% of active tasks` : "Overdue share"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        {summary && <DeliveryCurve data={summary.deliveryCurve} planned={plannedTotal} completed={completedTotal} />}
        <TeamFocus members={team} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <CadenceGrid data={summary?.byCadence || []} />
        <StatusDonut data={summary?.byStatus || []} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <ActivityFeed items={activity} />
        <TeamPending members={team} />
      </section>
    </div>
  );
}
