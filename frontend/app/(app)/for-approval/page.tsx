"use client";
import Link from "next/link";
import { TasksView } from "@/components/tasks/tasks-view";

export default function ForApprovalPage() {
  return (
    <div className="space-y-2">
      <TasksView
        title="For Approval"
        subtitle="Tasks your team submitted for completion — open a task to read submission remarks, then approve or reject."
        preset={{ approval: true }}
      />
      <p className="px-1 text-center text-xs text-zinc-500">
        After you approve tasks, view full history per person on{" "}
        <Link href="/performance" className="font-semibold text-brand-600 underline-offset-2 hover:underline">
          Performance → Task approval history
        </Link>
        .
      </p>
    </div>
  );
}
