"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function MasterRecurringPage() {
  return (
    <TasksView
      title="Master Recurring Tasks"
      subtitle="Recurring tasks you assigned or that are assigned to you. Approved tasks stay completed until the next day — use Status filter for completed, awaiting approval, or rejected."
      preset={{ recurring: true }}
      masterAdminActions
    />
  );
}
