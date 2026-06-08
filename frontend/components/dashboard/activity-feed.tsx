"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { SurfacePanel } from "@/components/ui/surface-panel";
import { formatAppDateTime } from "@/lib/date-format";
import { motion } from "framer-motion";

type Item = {
  _id: string;
  actorName?: string;
  message: string;
  taskTitle?: string;
  taskType?: string;
  createdAt: string;
};

export function ActivityFeed({ items }: { items: Item[] }) {
  return (
    <SurfacePanel
      chip="Recent activity"
      title="Latest updates"
      action={
        <div className="rounded-full bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-900">
          Last {items.length}
        </div>
      }
    >
      <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1">
        {items.length === 0 && (
          <EmptyState title="No activity yet" description="Updates from your team will appear here." variant="motivate" />
        )}
        {items.map((it, i) => (
          <motion.div
            key={it._id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="group flex items-start gap-3 rounded-xl border border-zinc-100 bg-gradient-to-r from-white to-zinc-50/60 p-3 transition-all hover:border-brand-200/60 hover:shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950"
          >
            <div className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient-soft ring-2 ring-brand-100/50 dark:ring-brand-900/30">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] leading-snug text-zinc-800 dark:text-zinc-100">
                <span className="font-semibold">{it.actorName || "System"}</span> {it.message}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10.5px] text-zinc-500">
                {it.taskType && (
                  <span className="inline-flex rounded-full bg-brand-50 px-2 py-0.5 font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                    {it.taskType}
                  </span>
                )}
                <span>{formatAppDateTime(it.createdAt)}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </SurfacePanel>
  );
}
