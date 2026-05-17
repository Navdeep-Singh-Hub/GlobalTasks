"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function ForApprovalPage() {
  return (
    <TasksView
      title="For Approval"
      subtitle="Tasks submitted by your team for completion approval (user-role tasks go to their operations lead)."
      preset={{ approval: true }}
    />
  );
}
