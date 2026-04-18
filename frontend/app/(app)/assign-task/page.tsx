"use client";

import { AssignTaskForm } from "@/components/tasks/assign-task-form";

export default function AssignTaskPage() {
  return (
    <div className="space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
          Create work
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Assign Task</h1>
        <p className="mt-1 text-sm text-zinc-500">Single one-time tasks or full recurring cadences — assign to multiple users with attachments and voice notes.</p>
      </div>
      <AssignTaskForm />
    </div>
  );
}
