"use client";

import { CoordinatorDailySheet } from "@/components/therapist/coordinator-daily-sheet";
import { PendingRecurringDailySessions } from "@/components/therapist/pending-recurring-daily-sessions";
import { TasksView } from "@/components/tasks/tasks-view";
import { PageHeader } from "@/components/ui/page-header";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { formatRoleLine } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type TargetUser = {
  _id: string;
  name: string;
  email: string;
  role: string;
  executorKind?: string;
  centerId?: { name?: string } | string | null;
};

function isTherapistUser(u: TargetUser | null) {
  if (!u) return false;
  const kind = String(u.executorKind || "").toLowerCase();
  return kind === "therapist" || (u.role === "executor" && kind === "therapist") || u.role === "supervisor";
}

export default function FillPastDataPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<TargetUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user?.canFillPastDataOnBehalf) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user?.canFillPastDataOnBehalf) return;
    let cancelled = false;
    api<{ users: TargetUser[] }>("/users?status=active")
      .then((d) => {
        if (cancelled) return;
        setUsers(Array.isArray(d.users) ? d.users : []);
        setLoadErr("");
      })
      .catch(() => {
        if (cancelled) return;
        setUsers([]);
        setLoadErr("Could not load users.");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.canFillPastDataOnBehalf]);

  const selected = useMemo(() => users.find((u) => u._id === selectedId) || null, [users, selectedId]);

  const options = useMemo(
    () =>
      users
        .map((u) => {
          const center =
            typeof u.centerId === "object" && u.centerId ? u.centerId.name || "" : "";
          const roleLine = formatRoleLine(u.role, u.executorKind);
          return {
            value: u._id,
            label: `${u.name} · ${roleLine}${center ? ` · ${center}` : ""}`,
            searchText: `${u.name} ${u.email} ${roleLine} ${center}`,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [users]
  );

  if (loading || !user?.canFillPastDataOnBehalf) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">Loading…</div>
    );
  }

  const showClinicalSessions = isTherapistUser(selected);
  const showCoordinator = selected?.role === "coordinator";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fill past data"
        subtitle="Select any user and fill their past sessions, supervisor/coordinator sheets, or open tasks on their behalf."
      />

      <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Select user
        </label>
        <SearchableSelect
          value={selectedId}
          onChange={setSelectedId}
          options={options}
          placeholder="Search name, email, or role…"
          searchPlaceholder="Type to search users…"
          emptyMessage="No matching users"
          className="max-w-xl"
        />
        {loadErr ? <p className="mt-2 text-sm text-rose-600">{loadErr}</p> : null}
        {selected ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            Filling as <span className="font-semibold text-zinc-900 dark:text-white">{selected.name}</span>
            {" · "}
            {formatRoleLine(selected.role, selected.executorKind)}
            {" · "}
            {selected.email}
          </p>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">Choose a user to unlock their forms below.</p>
        )}
      </div>

      {selected ? (
        <div className="space-y-8">
          {showCoordinator ? <CoordinatorDailySheet onBehalfUser={selected} /> : null}
          {showClinicalSessions ? <PendingRecurringDailySessions onBehalfUser={selected} /> : null}

          <div className={showClinicalSessions || showCoordinator ? "border-t border-zinc-200 pt-8 dark:border-zinc-800" : undefined}>
            <TasksView
              title="Open tasks"
              subtitle={`Submit open / overdue tasks for ${selected.name}. Past-day recurring locks are bypassed for this screen.`}
              preset={{
                statusGroup: "open",
                assigneeInbox: true,
                onBehalfAssigneeId: selected._id,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
