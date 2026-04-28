"use client";

import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import type { Role } from "@/lib/roles";
import { NAV_ALL, NAV_CEO_ONLY, NAV_MANAGEMENT, formatRoleLine } from "@/lib/roles";
import {
  LayoutDashboard,
  CheckSquare,
  Repeat,
  Package,
  History,
  UserPlus,
  ClipboardCheck,
  Shuffle,
  MessageCircle,
  Trash2,
  Zap,
  Activity,
  Plug,
  ShieldCheck,
  Settings,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
  badge?: string;
  accent?: "new" | "count";
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: NAV_ALL },
  { href: "/pending-single", label: "Pending Single", icon: CheckSquare, roles: NAV_ALL },
  { href: "/pending-recurring", label: "Pending Recurring", icon: Repeat, roles: NAV_ALL, accent: "count" },
  { href: "/master-single", label: "Master Single", icon: Package, roles: NAV_MANAGEMENT },
  { href: "/master-recurring", label: "Master Recurring", icon: History, roles: NAV_MANAGEMENT },
  { href: "/assign-task", label: "Assign Task", icon: UserPlus, roles: NAV_MANAGEMENT },
  { href: "/for-approval", label: "For Approval", icon: ClipboardCheck, roles: NAV_MANAGEMENT },
  { href: "/task-shift", label: "Task Shift", icon: Shuffle, roles: NAV_MANAGEMENT },
  { href: "/chat-support", label: "Chat Support", icon: MessageCircle, roles: NAV_ALL },
  { href: "/recycle-bin", label: "Recycle bin", icon: Trash2, roles: NAV_MANAGEMENT },
  { href: "/performance", label: "Performance", icon: Zap, roles: NAV_MANAGEMENT },
  { href: "/therapist-performance", label: "Therapist Performance", icon: Activity, roles: NAV_MANAGEMENT },
  { href: "/integrations", label: "Integrations", icon: Plug, roles: NAV_CEO_ONLY, badge: "NEW", accent: "new" },
  { href: "/admin", label: "Admin Panel", icon: ShieldCheck, roles: NAV_MANAGEMENT },
  { href: "/settings", label: "Settings", icon: Settings, roles: NAV_ALL },
  { href: "/help", label: "Help & Support", icon: LifeBuoy, roles: NAV_ALL },
];

export function AppSidebar({
  variant = "desktop",
  mobileOpen = false,
  onCloseMobile,
}: {
  variant?: "desktop" | "mobile";
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (variant === "mobile") return;
    const saved = typeof window !== "undefined" ? localStorage.getItem("sidebar_collapsed") : null;
    if (saved) setCollapsed(saved === "1");
  }, [variant]);

  useEffect(() => {
    if (variant === "mobile") return;
    if (typeof window !== "undefined") localStorage.setItem("sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed, variant]);

  useEffect(() => {
    let cancel = false;
    import("@/lib/api").then(({ api }) => {
      api<{ tasks: { _id: string }[] }>("/tasks?recurring=true&status=pending&limit=1")
        .then((d) => {
          if (!cancel) setPendingCount((d as unknown as { total: number }).total ?? d.tasks.length);
        })
        .catch(() => {});
    });
    return () => {
      cancel = true;
    };
  }, [pathname]);

  if (!user) return null;
  const role = user.role;
  const items = NAV.filter((n) => n.roles.includes(role));
  const centerName = typeof user.centerId === "object" && user.centerId ? user.centerId.name || "Center" : "";

  const shell = (
    <aside
      className={cn(
        "relative flex shrink-0 flex-col border-r border-zinc-200 bg-white transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950",
        variant === "desktop" && (collapsed ? "w-[68px]" : "w-[236px]"),
        variant === "mobile" && "h-full w-[min(88vw,300px)] border-r-0 shadow-2xl"
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-zinc-100 px-4 dark:border-zinc-800">
        {!collapsed ? (
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => onCloseMobile?.()}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-[13px] font-black tracking-tight text-white shadow-brand">
              GT
            </div>
            <div className="leading-tight">
              <div className="bg-brand-gradient bg-clip-text text-[15px] font-bold text-transparent">GlobalTasks</div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-400">Workspace</div>
            </div>
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-[13px] font-black text-white shadow-brand"
            onClick={() => onCloseMobile?.()}
          >
            GT
          </Link>
        )}
        {variant === "mobile" ? (
          <button
            type="button"
            onClick={() => onCloseMobile?.()}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 hover:text-brand-600 dark:border-zinc-700 dark:bg-zinc-900"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:text-brand-600 dark:border-zinc-700 dark:bg-zinc-900",
              collapsed && "absolute -right-3 top-6"
            )}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto overscroll-y-contain px-2 py-4">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const showCount = item.accent === "count" && pendingCount !== null && pendingCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onCloseMobile?.()}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-brand-gradient text-white shadow-brand"
                  : "text-zinc-600 hover:bg-brand-50 hover:text-brand-700 dark:text-zinc-300 dark:hover:bg-zinc-800/80 dark:hover:text-white",
                collapsed && variant === "desktop" && "justify-center px-2"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-white" : "text-current")} />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {!collapsed && item.accent === "new" && (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">NEW</span>
              )}
              {!collapsed && showCount && (
                <span className={cn("rounded-full px-1.5 text-[10px] font-bold", active ? "bg-white/20 text-white" : "bg-rose-500 text-white")}>
                  {pendingCount}
                </span>
              )}
              {collapsed && item.accent === "new" && (
                <span className="absolute -right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />
              )}
              {collapsed && showCount && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={cn("border-t border-zinc-100 p-3 dark:border-zinc-800", collapsed && variant === "desktop" && "px-2")}>
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl bg-gradient-to-r from-brand-50 to-accent-cyan/10 p-2.5 dark:from-brand-900/20 dark:to-accent-cyan/10",
            collapsed && variant === "desktop" && "justify-center bg-transparent p-0"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-brand">
            {user.name.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{user.name}</div>
              <div className="text-[10px] text-zinc-500">{formatRoleLine(user.role, user.executorKind)}</div>
              {role !== "ceo" && centerName && (
                <div className="mt-1 inline-flex rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
                  {centerName}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  if (variant === "mobile") {
    if (!mobileOpen) return null;
    return (
      <div className="fixed inset-0 z-50 lg:hidden">
        <button
          type="button"
          className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
          aria-label="Close navigation overlay"
          onClick={() => onCloseMobile?.()}
        />
        <div className="absolute inset-y-0 left-0 flex">{shell}</div>
      </div>
    );
  }

  return <div className="hidden lg:flex">{shell}</div>;
}
