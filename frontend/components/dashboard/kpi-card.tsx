"use client";

import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Tone = "brand" | "amber" | "emerald" | "rose" | "violet";

const toneMap: Record<Tone, { icon: string; ring: string; dot: string; trend: string }> = {
  brand: {
    icon: "bg-brand-50 text-brand-600 ring-brand-100",
    ring: "ring-brand-100/60",
    dot: "bg-brand-400",
    trend: "text-emerald-600 bg-emerald-50",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 ring-amber-100",
    ring: "ring-amber-100/60",
    dot: "bg-amber-400",
    trend: "text-emerald-600 bg-emerald-50",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    ring: "ring-emerald-100/60",
    dot: "bg-emerald-400",
    trend: "text-zinc-500 bg-zinc-100",
  },
  rose: {
    icon: "bg-rose-50 text-rose-600 ring-rose-100",
    ring: "ring-rose-100/60",
    dot: "bg-rose-400",
    trend: "text-rose-600 bg-rose-50",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600 ring-violet-100",
    ring: "ring-violet-100/60",
    dot: "bg-violet-400",
    trend: "text-emerald-600 bg-emerald-50",
  },
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "brand",
  trend,
  hint,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  trend?: string;
  hint?: string;
}) {
  const t = toneMap[tone];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft dark:border-zinc-800 dark:bg-zinc-950">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-gradient-soft opacity-70 blur-xl transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl ring-4", t.icon, t.ring)}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</div>
            <div className="mt-1 text-[30px] font-bold leading-none tracking-tight text-zinc-900 dark:text-zinc-50">
              {value}
            </div>
          </div>
        </div>
        {trend && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-semibold", t.trend)}>
            <TrendingUp className="h-3 w-3" />
            {trend}
          </span>
        )}
      </div>
      {hint && <div className="relative mt-4 text-[11.5px] text-zinc-500">{hint}</div>}
    </div>
  );
}
