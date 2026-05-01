"use client";

import { CoordinatorDailySheet } from "@/components/therapist/coordinator-daily-sheet";
import { TasksView } from "@/components/tasks/tasks-view";
import { PendingRecurringDailySessions } from "@/components/therapist/pending-recurring-daily-sessions";
import { useAuth } from "@/contexts/auth-context";

export default function PendingRecurringPage() {
  const { user } = useAuth();
  const showTherapistDailyLog =
    (user?.role === "executor" && user?.executorKind === "therapist") || user?.role === "supervisor";
  const showCoordinatorSheet = user?.role === "coordinator";
  const showTopDailyBlock = showTherapistDailyLog || showCoordinatorSheet;

  return (
    <div className={showTopDailyBlock ? "space-y-8" : "space-y-5"}>
      {showCoordinatorSheet && <CoordinatorDailySheet />}
      {showTherapistDailyLog && <PendingRecurringDailySessions />}

      <div className={showTopDailyBlock ? "border-t border-zinc-200 pt-8 dark:border-zinc-800" : undefined}>
        <TasksView
          title="Pending Recurring"
          subtitle="Recurring tasks waiting to be completed for the current cadence."
          preset={{ recurring: true, status: "pending", statusGroup: "open" }}
        />
      </div>
    </div>
  );
}
