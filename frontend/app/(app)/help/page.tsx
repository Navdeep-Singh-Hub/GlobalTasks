"use client";

import { PageHeader } from "@/components/ui/page-header";
import { SurfacePanel } from "@/components/ui/surface-panel";
import { LifeBuoy, BookOpen, ShieldCheck, Sparkles, MessageCircle } from "lucide-react";
import Link from "next/link";

export default function HelpPage() {
  const guides = [
    { icon: Sparkles, title: "Getting started", desc: "Sidebar, dashboard, and core flows in 5 minutes.", href: "/dashboard" },
    { icon: BookOpen, title: "Task patterns", desc: "Single vs recurring, weekly offs, and voice notes.", href: "/pending-single" },
    { icon: ShieldCheck, title: "Admin & permissions", desc: "Roles, approvals, and the Admin Panel.", href: "/admin" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        chip="Help center"
        icon={LifeBuoy}
        title="Help & support"
        subtitle="Product tours, patterns, and support escalation."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {guides.map((g, i) => (
          <Link key={g.title} href={g.href}>
            <SurfacePanel
              variant="gradient-border"
              className="interactive-card h-full cursor-pointer border-white/80 dark:border-zinc-800/80"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-brand">
                <g.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-sm font-bold text-zinc-900 dark:text-zinc-50">{g.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-500">{g.desc}</div>
            </SurfacePanel>
          </Link>
        ))}
      </div>

      <SurfacePanel chip="Need more help?" title="Chat with support" variant="elevated">
        <p className="-mt-2 text-sm text-zinc-500">Reach out for account issues, workflow questions, or feature requests.</p>
        <Link
          href="/chat-support"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-brand transition hover:brightness-105"
        >
          <MessageCircle className="h-4 w-4" />
          Open chat support
        </Link>
      </SurfacePanel>
    </div>
  );
}
