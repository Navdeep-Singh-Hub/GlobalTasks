import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm",
          "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200",
          "dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500",
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
          "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm shadow-sm",
          "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200",
          "dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100",
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
          "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm",
          "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200",
          "dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
