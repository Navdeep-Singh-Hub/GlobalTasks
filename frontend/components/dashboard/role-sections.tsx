"use client";

import { AlertTriangle, CheckCircle2, ListChecks, Timer, TriangleAlert, Users } from "lucide-react";
import { KpiCard } from "./kpi-card";
import { DeliveryCurve } from "./delivery-curve";
import { TeamFocus } from "./team-focus";
import { CadenceGrid } from "./cadence-grid";
import { StatusDonut } from "./status-donut";
import { ActivityFeed } from "./activity-feed";
import { TeamPending } from "./team-pending";
import type {
  ActivityItem,
  CioSummary,
  CoordinatorReport,
  CentreHeadReport,
  IndividualReport,
  Summary,
  SupervisorReport,
  TeamMember,
} from "./types";

export function ExecutorDashboard({
  individual,
  summary,
  activity,
}: {
  individual: IndividualReport | null;
  summary: Summary | null;
  activity: ActivityItem[];
}) {
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Today’s tasks" value={individual?.total ?? "—"} icon={ListChecks} tone="brand" hint="Your tracked tasks" />
        <KpiCard label="Pending" value={individual?.pending ?? "—"} icon={Timer} tone="amber" hint="Need your action" />
        <KpiCard label="Completed" value={individual?.completed ?? "—"} icon={CheckCircle2} tone="emerald" hint="Finished by you" />
        <KpiCard
          label="Overdue"
          value={individual?.overdue ?? "—"}
          icon={TriangleAlert}
          tone="rose"
          trend={individual ? `${individual.completionPercent}% completion` : "—"}
          hint="Delayed tasks"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <CadenceGrid data={summary?.byCadence || []} />
        <StatusDonut data={summary?.byStatus || []} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <ActivityFeed items={activity} />
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
          <div className="chip border border-zinc-200 bg-zinc-50 text-zinc-500">My completion</div>
          <h3 className="mt-3 text-[20px] font-bold tracking-tight">Your completion trend</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {individual ? `${individual.completionPercent}% completion, ${individual.overdue} overdue task(s).` : "No performance data yet."}
          </p>
        </div>
      </section>
    </>
  );
}

export function SupervisorDashboard({
  supervisor,
  summary,
  team,
  activity,
  plannedTotal,
  completedTotal,
}: {
  supervisor: SupervisorReport | null;
  summary: Summary | null;
  team: TeamMember[];
  activity: ActivityItem[];
  plannedTotal: number;
  completedTotal: number;
}) {
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Team members" value={supervisor?.teamCount ?? "—"} icon={Users} tone="brand" hint="Direct reports" />
        <KpiCard label="Team task status" value={supervisor?.total ?? "—"} icon={ListChecks} tone="violet" hint="Total team tasks" />
        <KpiCard label="Pending approvals" value={summary?.cards.pending ?? "—"} icon={Timer} tone="amber" hint="Awaiting progression" />
        <KpiCard label="Delayed tasks" value={supervisor?.overdue ?? "—"} icon={TriangleAlert} tone="rose" hint="Team overdue count" />
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
    </>
  );
}

export function CoordinatorDashboard({
  coordinator,
  summary,
  team,
  activity,
  plannedTotal,
  completedTotal,
}: {
  coordinator: CoordinatorReport | null;
  summary: Summary | null;
  team: TeamMember[];
  activity: ActivityItem[];
  plannedTotal: number;
  completedTotal: number;
}) {
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Supervisors" value={coordinator?.supervisors ?? "—"} icon={Users} tone="brand" hint="Reporting to you" />
        <KpiCard label="Executors" value={coordinator?.executors ?? "—"} icon={ListChecks} tone="violet" hint="Managed headcount" />
        <KpiCard label="Departments tracked" value={coordinator?.byDepartment?.length ?? "—"} icon={CheckCircle2} tone="emerald" hint="Active departments" />
        <KpiCard label="Task completion trends" value={summary?.cards.completed ?? "—"} icon={Timer} tone="amber" hint="Completion in selected scope" />
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
    </>
  );
}

export function CentreHeadDashboard({
  centreHead,
  summary,
  team,
  activity,
  plannedTotal,
  completedTotal,
}: {
  centreHead: CentreHeadReport | null;
  summary: Summary | null;
  team: TeamMember[];
  activity: ActivityItem[];
  plannedTotal: number;
  completedTotal: number;
}) {
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Center-wise performance" value={centreHead?.summary?.length ?? "—"} icon={ListChecks} tone="brand" hint="Centers in your scope" />
        <KpiCard label="Department comparison" value={summary?.byCadence?.length ?? "—"} icon={Users} tone="violet" hint="Cross-department activity" />
        <KpiCard label="Escalation alerts" value={summary?.cards.overdue ?? "—"} icon={AlertTriangle} tone="rose" hint="Overdue and escalated signals" />
        <KpiCard label="Completed" value={summary?.cards.completed ?? "—"} icon={CheckCircle2} tone="emerald" hint="Execution output" />
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
    </>
  );
}

export function CioDashboard({
  ceo,
  team,
  summary,
  activity,
  plannedTotal,
  completedTotal,
}: {
  ceo: CioSummary | null;
  team: TeamMember[];
  summary: Summary | null;
  activity: ActivityItem[];
  plannedTotal: number;
  completedTotal: number;
}) {
  const topPerformers = [...team].sort((a, b) => b.completion - a.completion).slice(0, 5);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total tasks" value={ceo?.totals?.total ?? "—"} icon={ListChecks} tone="brand" hint="Completed vs pending" />
        <KpiCard label="Completed" value={ceo?.totals?.completed ?? "—"} icon={CheckCircle2} tone="emerald" hint="Delivered tasks" />
        <KpiCard label="Pending" value={ceo?.totals?.pending ?? "—"} icon={Timer} tone="amber" hint="Waiting tasks" />
        <KpiCard label="Red flags" value={ceo?.totals?.overdue ?? "—"} icon={TriangleAlert} tone="rose" hint="Delayed tasks" />
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

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-lg font-bold">Top performers</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {topPerformers.map((m) => (
              <li key={m.user._id} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span>{m.user.name}</span>
                <span className="font-semibold text-emerald-600">{m.completion}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-lg font-bold">Non-reporting staff</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {(ceo?.nonReporting || []).slice(0, 8).map((u) => (
              <li key={u._id} className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <div className="font-semibold">{u.name}</div>
                <div className="text-xs text-zinc-500">{u.email}</div>
              </li>
            ))}
            {!ceo?.nonReporting?.length && <li className="text-zinc-500">No red flag users found.</li>}
          </ul>
        </div>
      </section>
    </>
  );
}
