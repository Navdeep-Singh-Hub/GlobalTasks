"use client";

import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Tone = "brand" | "amber" | "emerald" | "rose" | "violet";

const toneMap: Record<Tone, { icon: string; ring: string; glow: string; trend: string; accent: string }> = {
  brand: {
    icon: "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-900/40 dark:text-brand-300",
    ring: "ring-brand-100/60 dark:ring-brand-800/40",
    glow: "from-brand-400/20 to-accent-cyan/10",
    trend: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300",
    accent: "bg-brand-400",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-900/40 dark:text-amber-300",
    ring: "ring-amber-100/60 dark:ring-amber-800/40",
    glow: "from-amber-400/20 to-orange-300/10",
    trend: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300",
    accent: "bg-amber-400",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300",
    ring: "ring-emerald-100/60 dark:ring-emerald-800/40",
    glow: "from-emerald-400/20 to-teal-300/10",
    trend: "text-zinc-500 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300",
    accent: "bg-emerald-400",
  },
  rose: {
    icon: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-900/40 dark:text-rose-300",
    ring: "ring-rose-100/60 dark:ring-rose-800/40",
    glow: "from-rose-400/20 to-pink-300/10",
    trend: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300",
    accent: "bg-rose-400",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-900/40 dark:text-violet-300",
    ring: "ring-violet-100/60 dark:ring-violet-800/40",
    glow: "from-violet-400/20 to-indigo-300/10",
    trend: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300",
    accent: "bg-violet-400",
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
    <div className="group interactive-card overflow-hidden border-white/80 p-5 dark:border-zinc-800/80">
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100",
          t.glow
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl ring-4 transition-transform duration-300 group-hover:scale-105", t.icon, t.ring)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</div>
            <div className="mt-1 text-[32px] font-bold leading-none tracking-tight text-zinc-900 dark:text-zinc-50">
              {value}
            </div>
          </div>
        </div>
        {trend && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold", t.trend)}>
            <TrendingUp className="h-3 w-3" />
            {trend}
          </span>
        )}
      </div>
      {hint && <div className="relative mt-4 text-[11.5px] leading-relaxed text-zinc-500">{hint}</div>}
      <div className={cn("absolute bottom-0 left-0 h-0.5 w-0 rounded-full transition-all duration-500 group-hover:w-full", t.accent)} />
    </div>
  );
}
