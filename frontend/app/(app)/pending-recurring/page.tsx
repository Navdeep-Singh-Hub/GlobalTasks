"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function PendingRecurringPage() {
  return (
    <TasksView
      title="Pending Recurring"
      subtitle="Recurring tasks waiting to be completed for the current cadence."
      preset={{ recurring: true, status: "pending" }}
    />
  );
}
