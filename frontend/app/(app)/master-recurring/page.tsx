"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function MasterRecurringPage() {
  return (
    <TasksView
      title="Master Recurring Tasks"
      subtitle="Daily, weekly, fortnightly, monthly, quarterly and yearly recurring work."
      preset={{ recurring: true }}
      masterAdminActions
    />
  );
}
