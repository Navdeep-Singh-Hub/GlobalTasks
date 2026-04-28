"use client";

import { TasksView } from "@/components/tasks/tasks-view";
import { PendingRecurringDailySessions } from "@/components/therapist/pending-recurring-daily-sessions";
import { useAuth } from "@/contexts/auth-context";

export default function PendingRecurringPage() {
  const { user } = useAuth();
  const showTherapistDailyLog =
    (user?.role === "executor" && user?.executorKind === "therapist") || user?.role === "supervisor";

  return (
    <div className={showTherapistDailyLog ? "space-y-8" : "space-y-5"}>
      {showTherapistDailyLog && <PendingRecurringDailySessions />}

      <div className={showTherapistDailyLog ? "border-t border-zinc-200 pt-8 dark:border-zinc-800" : undefined}>
        <TasksView
          title="Pending Recurring"
          subtitle="Recurring tasks waiting to be completed for the current cadence."
          preset={{ recurring: true, status: "pending", statusGroup: "open" }}
        />
      </div>
    </div>
  );
}
