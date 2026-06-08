"use client";

import { cn } from "@/lib/utils";
import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

type SurfacePanelProps = Omit<HTMLMotionProps<"div">, "children"> & {
  title?: string;
  chip?: string;
  action?: ReactNode;
  variant?: "default" | "elevated" | "gradient-border";
  noPadding?: boolean;
  children?: ReactNode;
};

export function SurfacePanel({
  className,
  title,
  chip,
  action,
  variant = "default",
  noPadding = false,
  children,
  ...props
}: SurfacePanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-2xl border backdrop-blur-md",
        variant === "default" && "border-white/80 bg-white/85 dark:border-zinc-800/80 dark:bg-zinc-950/80",
        variant === "elevated" && "border-white/90 bg-white/90 shadow-soft dark:border-zinc-800 dark:bg-zinc-950/90",
        variant === "gradient-border" && "surface-gradient-border bg-white/90 dark:bg-zinc-950/90",
        !noPadding && "p-5",
        className
      )}
      style={
        variant === "default"
          ? { boxShadow: "0 8px 32px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255,255,255,0.65)" }
          : undefined
      }
      {...props}
    >
      {(title || chip || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {chip && (
              <span className="chip border border-brand-200/50 bg-brand-50/70 text-brand-700 dark:border-brand-800/50 dark:bg-brand-950/40 dark:text-brand-200">
                {chip}
              </span>
            )}
            {title && <h3 className={cn("font-bold tracking-tight text-zinc-900 dark:text-zinc-50", chip ? "mt-3 text-lg" : "text-lg")}>{title}</h3>}
          </div>
          {action}
        </div>
      )}
      {children}
    </motion.div>
  );
}
