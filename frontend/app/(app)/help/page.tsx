"use client";

import { LifeBuoy, BookOpen, ShieldCheck, Sparkles } from "lucide-react";

export default function HelpPage() {
  const guides = [
    { icon: Sparkles, title: "Getting started", desc: "Sidebar, dashboard, and core flows in 5 minutes." },
    { icon: BookOpen, title: "Task patterns", desc: "Single vs recurring, weekly offs, and voice notes." },
    { icon: ShieldCheck, title: "Admin & permissions", desc: "Roles, approvals, and the Admin Panel." },
  ];
  return (
    <div className="space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <LifeBuoy className="h-3 w-3" /> Help center
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Help & support</h1>
        <p className="mt-1 text-sm text-zinc-500">Product tours, patterns, and support escalation.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {guides.map((g) => (
          <div key={g.title} className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600">
              <g.icon className="h-5 w-5" />
            </div>
            <div className="mt-3 text-sm font-bold">{g.title}</div>
            <div className="mt-1 text-xs text-zinc-500">{g.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
