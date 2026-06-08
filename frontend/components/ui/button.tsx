import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger" | "soft" | "gradient" | "success";
type Size = "sm" | "md" | "lg";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ className, variant = "primary", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex touch-manipulation select-none items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "active:scale-[0.97]",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-5 py-3 text-sm",
        variant === "primary" &&
          "bg-brand text-white shadow-brand hover:bg-brand-600 hover:shadow-glow",
        variant === "gradient" &&
          "bg-brand-gradient text-white shadow-brand hover:brightness-105 hover:shadow-glow",
        variant === "success" &&
          "bg-success-gradient text-white shadow-glow-emerald hover:brightness-105",
        variant === "ghost" &&
          "bg-transparent text-foreground hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80",
        variant === "soft" &&
          "border border-brand-200/60 bg-brand-50/80 text-brand-700 hover:bg-brand-100 dark:border-brand-800/60 dark:bg-brand-900/30 dark:text-brand-200 dark:hover:bg-brand-900/50",
        variant === "outline" &&
          "border border-zinc-200/90 bg-white/80 text-foreground shadow-sm backdrop-blur-sm hover:border-brand-300 hover:bg-brand-50/50 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:border-brand-700 dark:hover:bg-brand-950/40",
        variant === "danger" &&
          "bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-sm hover:from-rose-700 hover:to-rose-600",
        className
      )}
      {...props}
    />
  );
});
