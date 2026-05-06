"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleLine } from "@/lib/roles";
import { CalendarDays, ChevronDown, Sparkles } from "lucide-react";
import Link from "next/link";
import type { CioSummary, CoordinatorReport, CentreHeadReport, IndividualReport, Summary, SupervisorReport, TeamMember, ActivityItem } from "@/components/dashboard/types";
import { CioDashboard, CoordinatorDashboard, CentreHeadDashboard, ExecutorDashboard, SupervisorDashboard } from "@/components/dashboard/role-sections";

export default function DashboardPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState<"month" | "all">("month");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [individual, setIndividual] = useState<IndividualReport | null>(null);
  const [supervisor, setSupervisor] = useState<SupervisorReport | null>(null);
  const [coordinator, setCoordinator] = useState<CoordinatorReport | null>(null);
  const [centreHead, setCentreHead] = useState<CentreHeadReport | null>(null);
  const [ceo, setCeo] = useState<CioSummary | null>(null);
  const [myPendingSingle, setMyPendingSingle] = useState(0);
  const [myPendingRecurring, setMyPendingRecurring] = useState(0);

  useEffect(() => {
    api<Summary>(`/dashboard/summary?scope=${scope}`).then(setSummary).catch(() => {});
    api<{ members: TeamMember[] }>("/dashboard/team-performance").then((d) => setTeam(d.members)).catch(() => setTeam([]));
    api<{ items: ActivityItem[] }>("/dashboard/activity?limit=10").then((d) => setActivity(d.items)).catch(() => setActivity([]));
    if (!user) return;
    if (user.role === "executor") api<IndividualReport>("/reports/individual").then(setIndividual).catch(() => setIndividual(null));
    if (user.role === "supervisor") api<SupervisorReport>("/reports/supervisor").then(setSupervisor).catch(() => setSupervisor(null));
    if (user.role === "coordinator") api<CoordinatorReport>("/reports/coordinator").then(setCoordinator).catch(() => setCoordinator(null));
    if (user.role === "centre_head") api<CentreHeadReport>("/reports/centre-head").then(setCentreHead).catch(() => setCentreHead(null));
    if (user.role === "ceo") api<CioSummary>("/reports/ceo-summary").then(setCeo).catch(() => setCeo(null));

    const showMyPending = user.role === "executor" || user.role === "coordinator" || user.role === "centre_head";
    if (!showMyPending) return;
    void Promise.all([
      api<{ total?: number }>("/tasks?myTasks=true&statusGroup=open&recurring=false&page=1&limit=1"),
      api<{ total?: number }>("/tasks?myTasks=true&statusGroup=open&recurring=true&page=1&limit=1"),
    ])
      .then(([single, recurring]) => {
        setMyPendingSingle(Number(single.total) || 0);
        setMyPendingRecurring(Number(recurring.total) || 0);
      })
      .catch(() => {
        setMyPendingSingle(0);
        setMyPendingRecurring(0);
      });
  }, [scope, user]);

  const monthLabel = useMemo(() => new Date().toLocaleDateString([], { month: "long", year: "numeric" }), []);
  const plannedTotal = summary?.deliveryCurve.reduce((a, b) => a + b.planned, 0) || 0;
  const completedTotal = summary?.deliveryCurve.reduce((a, b) => a + b.completed, 0) || 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-3xl sm:p-6 md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-gradient-soft blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-accent-cyan/10 blur-3xl" />

        <div className="relative grid gap-5 sm:gap-6 md:grid-cols-[1.35fr_1fr] md:items-end">
          <div>
            <div className="chip border border-zinc-200 bg-zinc-50 text-zinc-500">
              <Sparkles className="h-3 w-3" />
              Command center
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              Welcome back, <span className="bg-brand-gradient bg-clip-text text-transparent">{user?.name?.split(" ")[0] || "Admin"}</span>
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900">
                <CalendarDays className="h-3 w-3" /> {scope === "month" ? "Current month" : "All time"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{" "}
                {user ? formatRoleLine(user.role, user.executorKind) : "—"}
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

      {(user?.role === "executor" || user?.role === "coordinator" || user?.role === "centre_head") && (
        <section className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/pending-single"
            className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-card transition hover:border-brand-300 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">My pending single</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{myPendingSingle}</div>
            <div className="mt-1 text-xs text-zinc-500">Open single tasks assigned to you</div>
          </Link>
          <Link
            href="/pending-recurring"
            className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-card transition hover:border-brand-300 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">My pending recurring</div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{myPendingRecurring}</div>
            <div className="mt-1 text-xs text-zinc-500">Open recurring tasks assigned to you</div>
          </Link>
        </section>
      )}

      {user?.role === "executor" && <ExecutorDashboard individual={individual} summary={summary} activity={activity} />}
      {user?.role === "supervisor" && (
        <SupervisorDashboard
          supervisor={supervisor}
          summary={summary}
          team={team}
          activity={activity}
          plannedTotal={plannedTotal}
          completedTotal={completedTotal}
        />
      )}
      {user?.role === "coordinator" && (
        <CoordinatorDashboard
          coordinator={coordinator}
          summary={summary}
          team={team}
          activity={activity}
          plannedTotal={plannedTotal}
          completedTotal={completedTotal}
        />
      )}
      {user?.role === "centre_head" && (
        <CentreHeadDashboard
          centreHead={centreHead}
          summary={summary}
          team={team}
          activity={activity}
          plannedTotal={plannedTotal}
          completedTotal={completedTotal}
        />
      )}
      {user?.role === "ceo" && (
        <CioDashboard
          ceo={ceo}
          summary={summary}
          team={team}
          activity={activity}
          plannedTotal={plannedTotal}
          completedTotal={completedTotal}
        />
      )}
    </div>
  );
}
