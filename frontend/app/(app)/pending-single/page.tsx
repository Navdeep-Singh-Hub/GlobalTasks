"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function PendingSinglePage() {
  return (
    <TasksView
      title="Pending Single"
      subtitle="One-time tasks that still need to be picked up."
      preset={{ recurring: false, status: "pending", statusGroup: "open" }}
      showCadenceFilter={false}
    />
  );
}
