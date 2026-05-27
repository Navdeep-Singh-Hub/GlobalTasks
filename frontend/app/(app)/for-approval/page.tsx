"use client";
import { TasksView } from "@/components/tasks/tasks-view";

export default function ForApprovalPage() {
  return (
    <TasksView
      title="For Approval"
      subtitle="Tasks your team submitted for completion — open a task to read submission remarks, then approve or reject."
      preset={{ approval: true }}
    />
  );
}
