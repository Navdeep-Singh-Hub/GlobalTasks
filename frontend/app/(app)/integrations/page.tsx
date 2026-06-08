"use client";

import { PageHeader } from "@/components/ui/page-header";
import { SurfacePanel } from "@/components/ui/surface-panel";
import { Plug, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

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
    <div className="space-y-6">
      <PageHeader
        chip="Connect"
        icon={Plug}
        title="Integrations"
        subtitle="Ship tasks into the tools your team already uses."
        meta={
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            <Sparkles className="h-3 w-3" /> New
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map((it, i) => (
          <motion.div
            key={it.name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <SurfacePanel variant="gradient-border" className="interactive-card group h-full">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-soft ${it.color}`}>
                <Plug className="h-5 w-5" />
              </div>
              <div className="mt-4 text-base font-bold text-zinc-900 dark:text-zinc-50">{it.name}</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-500">{it.desc}</div>
              <button className="mt-4 rounded-xl bg-brand-gradient px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white shadow-brand transition-all group-hover:brightness-105 group-hover:shadow-glow">
                Connect
              </button>
            </SurfacePanel>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
