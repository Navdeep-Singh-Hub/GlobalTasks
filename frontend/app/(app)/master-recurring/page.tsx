"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function MasterRecurringPage() {
  return (
    <TasksView
      title="Master Recurring Tasks"
      subtitle="CEO sees every recurring task assigned by anyone to anyone. Other managers see only tasks they assigned or that are assigned to them. Completed filter includes tasks with approved history (even if today's occurrence is pending)."
      preset={{ recurring: true }}
      masterAdminActions
    />
  );
}
