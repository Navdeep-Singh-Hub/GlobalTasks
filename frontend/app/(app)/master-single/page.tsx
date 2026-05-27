"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function MasterSinglePage() {
  return (
    <TasksView
      title="Master Tasks"
      subtitle="One-time master tasks you assigned or that are assigned to you."
      preset={{ recurring: false }}
      showCadenceFilter={false}
      masterAdminActions
    />
  );
}
