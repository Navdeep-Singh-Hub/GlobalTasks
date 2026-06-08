import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/80 bg-white/85 shadow-card backdrop-blur-sm",
        "dark:border-zinc-800/80 dark:bg-zinc-950/85",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-b border-zinc-100/80 bg-gradient-to-r from-zinc-50/50 to-transparent p-5 dark:border-zinc-800 dark:from-zinc-900/50",
        className
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function SectionChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-brand-200/50 bg-brand-50/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700 backdrop-blur-sm",
        "dark:border-brand-800/50 dark:bg-brand-950/40 dark:text-brand-200",
        className
      )}
    >
      <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-brand-400" />
      {label}
    </span>
  );
}
