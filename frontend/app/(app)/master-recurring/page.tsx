"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function MasterRecurringPage() {
  return (
    <TasksView
      title="Master Recurring Tasks"
      subtitle="Recurring master tasks you assigned or that are assigned to you."
      preset={{ recurring: true }}
      masterAdminActions
    />
  );
}
