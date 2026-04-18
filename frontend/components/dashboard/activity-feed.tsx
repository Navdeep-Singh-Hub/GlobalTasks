"use client";

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
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between">
        <div>
          <div className="chip border border-zinc-200 bg-zinc-50 text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            Recent activity
          </div>
          <h3 className="mt-3 text-[20px] font-bold tracking-tight">Latest updates</h3>
        </div>
        <div className="rounded-full bg-zinc-50 px-3 py-1 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-900">
          Last {items.length}
        </div>
      </div>

      <div className="mt-4 max-h-[380px] space-y-3 overflow-y-auto pr-1">
        {items.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-zinc-500">No activity yet.</div>}
        {items.map((it) => (
          <div key={it._id} className="flex items-start gap-3 rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
            <div className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient-soft">
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
                <span>
                  {new Date(it.createdAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
