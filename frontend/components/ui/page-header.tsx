"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

type PageHeaderProps = {
  chip?: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  variant?: "default" | "compact" | "hero";
};

export function PageHeader({
  chip,
  title,
  subtitle,
  icon: Icon,
  meta,
  actions,
  children,
  className,
  variant = "default",
}: PageHeaderProps) {
  const isHero = variant === "hero";
  const isCompact = variant === "compact";

  return (
    <section
      className={cn(
        "page-hero",
        isCompact && "rounded-xl p-4 sm:rounded-2xl",
        isHero && "sm:p-8",
        className
      )}
    >
      <div
        className="page-hero-blob -right-20 -top-20 h-56 w-56 bg-brand-gradient-soft"
        aria-hidden
      />
      <div
        className="page-hero-blob -bottom-16 -left-16 h-40 w-40 bg-accent-cyan/20"
        style={{ animationDelay: "1.5s" }}
        aria-hidden
      />

      <div
        className={cn(
          "relative flex flex-col gap-4",
          actions && "sm:flex-row sm:items-start sm:justify-between"
        )}
      >
        <div className="min-w-0 flex-1">
          {(chip || Icon) && (
            <div className="chip border border-brand-200/60 bg-brand-50/80 text-brand-700 dark:border-brand-800/60 dark:bg-brand-950/40 dark:text-brand-200">
              {Icon ? <Icon className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {chip || "Workspace"}
            </div>
          )}
          <h1
            className={cn(
              "mt-3 font-bold tracking-tight text-zinc-900 dark:text-zinc-50",
              isHero ? "text-2xl sm:text-3xl md:text-4xl" : isCompact ? "text-xl sm:text-2xl" : "text-xl sm:text-2xl md:text-3xl"
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p className={cn("mt-1.5 text-zinc-500 dark:text-zinc-400", isHero ? "text-sm sm:text-base max-w-2xl" : "text-sm")}>
              {subtitle}
            </p>
          )}
          {meta && <div className="mt-3">{meta}</div>}
          {children}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}
