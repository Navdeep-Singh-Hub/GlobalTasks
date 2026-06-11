"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function MasterSinglePage() {
  return (
    <TasksView
      title="Master Tasks"
      subtitle="CEO sees every one-time task assigned by anyone to anyone. Other managers see only tasks they assigned or that are assigned to them. Use Show Filters → Status to view completed or rejected tasks."
      preset={{ recurring: false }}
      showCadenceFilter={false}
      masterAdminActions
    />
  );
}
