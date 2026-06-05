"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function MasterRecurringPage() {
  return (
    <TasksView
      title="Master Recurring Tasks"
      subtitle="Recurring tasks you assigned or that are assigned to you. Completed filter includes tasks with approved history (even if today's occurrence is pending)."
      preset={{ recurring: true }}
      masterAdminActions
    />
  );
}
