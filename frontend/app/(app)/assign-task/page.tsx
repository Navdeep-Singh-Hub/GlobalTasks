"use client";

import { AssignTaskForm } from "@/components/tasks/assign-task-form";
import { PageHeader } from "@/components/ui/page-header";
import { UserPlus } from "lucide-react";

export default function AssignTaskPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        chip="Create work"
        title="Assign Task"
        subtitle="Single one-time tasks or full recurring cadences — assign to multiple users with attachments and voice notes."
        icon={UserPlus}
      />
      <AssignTaskForm />
    </div>
  );
}
