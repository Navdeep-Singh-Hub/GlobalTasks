"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function ForApprovalPage() {
  return (
    <TasksView
      title="For Approval"
      subtitle="Tasks that require CEO approval before being marked completed."
      preset={{ approval: true }}
    />
  );
}
