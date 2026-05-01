"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleLine, isManagement } from "@/lib/roles";
import { api } from "@/lib/api";
import { Bell, LogOut, Menu, UserPlus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Notif = { _id: string; title: string; message: string; read: boolean; createdAt: string };

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const load = () =>
      api<{ notifications: Notif[]; unread: number }>("/notifications")
        .then((d) => {
          setNotifications(d.notifications);
          setUnread(d.unread);
        })
        .catch(() => {});
    load();
    const id = window.setInterval(load, 10000);
    return () => window.clearInterval(id);
  }, [user]);

  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("touchstart", onDoc, { passive: true });
    }
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  useEffect(() => {
    setNavOpen(false);
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    if (navOpen) {
      document.body.style.overflow = "hidden";
    } else if (document.body.style.overflow === "hidden") {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  if (!user) return <>{children}</>;
  const centerName = typeof user.centerId === "object" && user.centerId ? user.centerId.name || "" : "";

  return (
    <div className="flex min-h-[100dvh] overflow-x-clip bg-surface-muted dark:bg-[#0b1220]">
      <AppSidebar variant="desktop" />
      <AppSidebar variant="mobile" mobileOpen={navOpen} onCloseMobile={() => setNavOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="safe-x sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-zinc-200 bg-white/80 py-2 pl-2 pr-3 backdrop-blur sm:gap-3 sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/75">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:border-brand-200 hover:text-brand-600 lg:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <div className="mx-auto inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] font-semibold tracking-tight sm:text-[15px]">
              <span className="text-zinc-500">Welcome</span>
              <span className="bg-brand-gradient bg-clip-text text-transparent">Global Child Wellness Centre</span>
            </div>
            {user.role !== "ceo" && centerName && (
              <div className="mt-1">
                <span className="inline-flex max-w-full truncate rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
                  Center: {centerName}
                </span>
              </div>
            )}
          </div>

          <div className="relative flex shrink-0 items-center gap-2" ref={panelRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 hover:border-brand-200 hover:text-brand-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow">
                  {unread}
                </span>
              )}
            </button>

            {isManagement(user.role) && (
              <a
                href="/admin"
                className="hidden h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 hover:border-brand-200 hover:text-brand-600 sm:flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                aria-label="Admin panel"
                title="User management"
              >
                <UserPlus className="h-[18px] w-[18px]" />
              </a>
            )}

            <ThemeToggle />

            <div className="hidden items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 md:flex">
              <div className="text-right leading-tight">
                <div className="font-semibold">{user.name}</div>
                <div className="text-[10px] tracking-wide text-zinc-500">{formatRoleLine(user.role, user.executorKind)}</div>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gradient text-[11px] font-bold text-white shadow-brand">
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 hover:border-rose-200 hover:text-rose-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>

            {open && (
              <div className="absolute right-0 top-12 z-40 w-[min(calc(100vw-2rem),360px)] max-w-[360px] animate-pop-in rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-zinc-800">
                  <div>
                    <div className="text-sm font-semibold">Notifications</div>
                    <div className="text-[11px] text-zinc-500">{unread} unread · last 30</div>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-brand-600 hover:underline"
                    onClick={async () => {
                      await api("/notifications/read-all", { method: "POST" });
                      setUnread(0);
                      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                    }}
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-zinc-500">You&apos;re all caught up</div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n._id}
                        className="flex items-start gap-3 border-b border-zinc-50 p-4 last:border-b-0 dark:border-zinc-900"
                      >
                        <span
                          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-zinc-300" : "bg-brand-gradient"}`}
                        />
                        <div className="flex-1">
                          <div className="text-xs font-semibold">{n.title}</div>
                          <div className="text-[11px] text-zinc-500">{n.message}</div>
                          <div className="mt-1 text-[10px] text-zinc-400">
                            {new Date(n.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="safe-x safe-b flex-1 overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] px-4 py-5 sm:px-5 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px] animate-fade-in">{children}</div>
        </div>
      </main>
    </div>
  );
}
