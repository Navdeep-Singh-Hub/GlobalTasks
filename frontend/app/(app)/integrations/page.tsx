"use client";

import { Plug } from "lucide-react";

const INTEGRATIONS = [
  { name: "Slack", desc: "Post task activity to channels", color: "from-[#611f69] to-[#ecb22e]" },
  { name: "Google Calendar", desc: "Sync due dates to your calendar", color: "from-blue-500 to-emerald-500" },
  { name: "Microsoft Teams", desc: "Daily digest in Teams", color: "from-indigo-500 to-violet-500" },
  { name: "Zapier", desc: "Connect 5,000+ apps via Zaps", color: "from-orange-500 to-amber-500" },
  { name: "Jira", desc: "Mirror tickets as tasks", color: "from-sky-500 to-blue-600" },
  { name: "Webhooks", desc: "Stream events to your server", color: "from-zinc-600 to-zinc-900" },
];

export default function IntegrationsPage() {
  return (
    <div className="space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <Plug className="h-3 w-3" /> Connect
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Integrations <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-white">New</span></h1>
        <p className="mt-1 text-sm text-zinc-500">Ship tasks into the tools your team already uses.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map((it) => (
          <div key={it.name} className="group rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft dark:border-zinc-800 dark:bg-zinc-950">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white ${it.color}`}>
              <Plug className="h-5 w-5" />
            </div>
            <div className="mt-3 text-base font-bold">{it.name}</div>
            <div className="mt-1 text-xs text-zinc-500">{it.desc}</div>
            <button className="mt-4 rounded-full bg-brand-gradient px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-brand transition-transform group-hover:translate-y-0">
              Connect
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
