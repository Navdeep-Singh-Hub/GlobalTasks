"use client";

import { CoordinatorDailySheet } from "@/components/therapist/coordinator-daily-sheet";
import { MissedOccurrencesPanel } from "@/components/tasks/missed-occurrences-panel";
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
        <div className="space-y-4">
          <TasksView
            title="Pending Recurring"
            subtitle="Only today's daily tasks appear here. When the calendar day changes, yesterday is marked not done automatically and you see the new day only."
            preset={{ recurring: true, statusGroup: "open", workableToday: true, myTasks: true, assigneeInbox: true }}
          />
          <MissedOccurrencesPanel />
        </div>
      </div>
    </div>
  );
}
