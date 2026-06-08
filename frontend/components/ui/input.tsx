import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-xl border border-zinc-200/90 bg-white/90 px-3.5 text-sm text-zinc-900 shadow-sm backdrop-blur-sm",
          "placeholder:text-zinc-400 transition-all duration-200",
          "focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200/80 focus:shadow-glow",
          "dark:border-zinc-700 dark:bg-zinc-950/90 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-950",
          className
        )}
        {...props}
      />
    );
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-xl border border-zinc-200/90 bg-white/90 px-3.5 py-2.5 text-sm shadow-sm backdrop-blur-sm transition-all duration-200",
          "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/80",
          "dark:border-zinc-700 dark:bg-zinc-950/90 dark:text-zinc-100",
          className
        )}
        {...props}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-10 w-full rounded-xl border border-zinc-200/90 bg-white/90 px-3 text-sm shadow-sm backdrop-blur-sm transition-all duration-200",
          "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/80",
          "dark:border-zinc-700 dark:bg-zinc-950/90 dark:text-zinc-100",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
