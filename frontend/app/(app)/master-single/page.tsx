"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function MasterSinglePage() {
  return (
    <TasksView
      title="Master Tasks"
      subtitle="One-time tasks you assigned or that are assigned to you. Use Show Filters → Status to view completed or rejected tasks."
      preset={{ recurring: false }}
      showCadenceFilter={false}
      masterAdminActions
    />
  );
}
