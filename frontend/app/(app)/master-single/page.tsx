"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function MasterSinglePage() {
  return (
    <TasksView
      title="Master Tasks"
      subtitle="Single one-time tasks across the entire workspace."
      preset={{ recurring: false }}
      showCadenceFilter={false}
      masterAdminActions
    />
  );
}
