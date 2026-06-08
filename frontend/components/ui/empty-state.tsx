"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Inbox, Layers, Sparkles } from "lucide-react";

type EmptyStateProps = {
  loading?: boolean;
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  variant?: "default" | "success" | "motivate";
};

export function EmptyState({
  loading = false,
  title,
  description,
  icon: Icon,
  action,
  className,
  variant = "default",
}: EmptyStateProps) {
  const DisplayIcon = loading ? Layers : Icon || (variant === "success" ? Sparkles : Inbox);

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-10 text-center sm:p-16",
        variant === "success"
          ? "border-emerald-300/60 bg-gradient-to-br from-emerald-50/80 to-teal-50/50 dark:border-emerald-800/40 dark:from-emerald-950/30 dark:to-teal-950/20"
          : variant === "motivate"
            ? "border-brand-300/50 bg-gradient-to-br from-brand-50/60 to-accent-cyan/10 dark:border-brand-800/40 dark:from-brand-950/30 dark:to-zinc-950"
            : "border-zinc-300/70 bg-white/60 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-950/60",
        className
      )}
    >
      <div
        className={cn(
          "relative flex h-16 w-16 items-center justify-center rounded-2xl shadow-soft",
          loading
            ? "bg-zinc-100 dark:bg-zinc-800"
            : variant === "success"
              ? "bg-success-gradient shadow-glow-emerald"
              : "bg-brand-gradient shadow-brand"
        )}
      >
        <DisplayIcon
          className={cn(
            "h-7 w-7",
            loading ? "animate-pulse text-zinc-400" : "text-white",
            !loading && variant === "default" && "text-white"
          )}
        />
        {!loading && variant === "motivate" && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent-gold text-[10px]">
            ✨
          </span>
        )}
      </div>
      <div className="mt-5 text-base font-bold text-zinc-800 dark:text-zinc-100">
        {loading ? "Loading…" : title || (variant === "success" ? "All caught up!" : "Nothing here yet")}
      </div>
      <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {loading
          ? "Fetching from the server…"
          : description ||
            (variant === "success"
              ? "You've completed everything on your list. Time to celebrate!"
              : "Try adjusting filters or create something new.")}
      </p>
      {action && !loading && <div className="mt-5">{action}</div>}
    </div>
  );
}
