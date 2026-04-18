import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger" | "soft" | "gradient";
type Size = "sm" | "md" | "lg";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ className, variant = "primary", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-5 py-3 text-sm",
        variant === "primary" &&
          "bg-brand text-white shadow-sm hover:bg-brand-600 active:scale-[0.99]",
        variant === "gradient" &&
          "bg-brand-gradient text-white shadow-brand hover:brightness-105 active:scale-[0.99]",
        variant === "ghost" &&
          "bg-transparent text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800",
        variant === "soft" &&
          "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-200",
        variant === "outline" &&
          "border border-zinc-200 bg-white text-foreground hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        className
      )}
      {...props}
    />
  );
});
