import { cn } from "@/lib/utils";

type Tone = "default" | "brand" | "amber" | "emerald" | "rose" | "violet" | "sky" | "zinc";

const toneMap: Record<Tone, string> = {
  default: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
  zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export function Badge({
  children,
  tone = "default",
  className,
  pulse,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
        toneMap[tone],
        className
      )}
    >
      {pulse && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" /></span>}
      {children}
    </span>
  );
}

export function priorityTone(p?: string): Tone {
  switch (p) {
    case "urgent": return "rose";
    case "high": return "rose";
    case "normal": return "zinc";
    case "low": return "emerald";
    default: return "zinc";
  }
}

export function statusTone(s?: string): Tone {
  switch (s) {
    case "pending": return "amber";
    case "in_progress": return "sky";
    case "awaiting_approval": return "violet";
    case "completed": return "emerald";
    case "cancelled": return "zinc";
    case "overdue": return "rose";
    default: return "zinc";
  }
}

export function cadenceTone(c?: string): Tone {
  switch (c) {
    case "one_time": return "zinc";
    case "daily": return "emerald";
    case "weekly": return "sky";
    case "fortnightly": return "brand";
    case "monthly": return "violet";
    case "quarterly": return "amber";
    case "yearly": return "rose";
    default: return "zinc";
  }
}

export function roleTone(r?: string): Tone {
  switch (r) {
    case "ceo":
    case "admin":
      return "rose";
    case "centre_head":
    case "manager":
      return "amber";
    case "coordinator":
      return "violet";
    case "supervisor":
      return "sky";
    case "executor":
    case "user":
      return "emerald";
    default:
      return "zinc";
  }
}
