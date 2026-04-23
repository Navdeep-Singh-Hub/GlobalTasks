"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/contexts/auth-context";
import { formatRoleLine } from "@/lib/roles";
import { Bell, Settings as SettingsIcon, Shield, UserCircle2 } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();

  const cards = [
    {
      icon: UserCircle2,
      title: "Profile",
      desc: "Your name, avatar, and contact info are visible across the workspace.",
      body: (
        <div className="space-y-1 text-[12.5px] text-zinc-600 dark:text-zinc-300">
          <div><span className="font-semibold">Name:</span> {user?.name}</div>
          <div><span className="font-semibold">Email:</span> {user?.email}</div>
          <div>
            <span className="font-semibold">Role:</span>{" "}
            <span>{user ? formatRoleLine(user.role, user.executorKind) : "—"}</span>
          </div>
        </div>
      ),
    },
    {
      icon: Bell,
      title: "Notifications",
      desc: "Choose how GlobalTasks keeps you informed about new work.",
      body: (
        <div className="space-y-2">
          {[
            ["In-app notifications", true],
            ["Email digest", true],
            ["Daily summary", false],
          ].map(([label, on]) => (
            <div key={label as string} className="flex items-center justify-between rounded-xl border border-zinc-100 p-2.5 text-xs dark:border-zinc-800">
              <span>{label as string}</span>
              <span className={`h-4 w-8 rounded-full ${on ? "bg-brand-gradient" : "bg-zinc-200 dark:bg-zinc-700"}`} />
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: Shield,
      title: "Workspace",
      desc: "These preferences apply to everyone in your workspace.",
      body: (
        <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
          <div><span className="font-semibold">Workspace:</span> Global Child Wellness Centre</div>
          <div><span className="font-semibold">Plan:</span> Pro · 3 seats</div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="chip border border-zinc-200 bg-white text-zinc-500">
            <SettingsIcon className="h-3 w-3" /> Preferences
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">Workspace, profile, notifications and theme preferences.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
          <span className="px-3 text-xs text-zinc-500">Theme</span>
          <ThemeToggle />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600">
              <c.icon className="h-5 w-5" />
            </div>
            <div className="mt-3 text-sm font-bold">{c.title}</div>
            <div className="mt-1 text-xs text-zinc-500">{c.desc}</div>
            <div className="mt-3">{c.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
