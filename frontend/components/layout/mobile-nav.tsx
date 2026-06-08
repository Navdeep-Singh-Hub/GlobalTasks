"use client";

import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { isManagement } from "@/lib/roles";
import { CheckSquare, ClipboardCheck, LayoutDashboard, Repeat, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const EXECUTOR_NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/pending-single", label: "Single", icon: CheckSquare },
  { href: "/pending-recurring", label: "Recurring", icon: Repeat },
];

const MANAGER_NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/pending-single", label: "Single", icon: CheckSquare },
  { href: "/assign-task", label: "Assign", icon: UserPlus },
  { href: "/for-approval", label: "Approve", icon: ClipboardCheck },
];

export function MobileNav() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user) return null;

  const items = isManagement(user.role) ? MANAGER_NAV : EXECUTOR_NAV;

  return (
    <nav
      className="safe-b fixed bottom-0 left-0 right-0 z-40 border-t border-white/40 bg-white/85 px-2 pb-2 pt-1.5 backdrop-blur-xl lg:hidden dark:border-zinc-800/60 dark:bg-zinc-950/90"
      aria-label="Mobile navigation"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-semibold transition-all duration-200",
                  active
                    ? "bg-brand-gradient text-white shadow-brand"
                    : "text-zinc-500 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-sm")} strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
