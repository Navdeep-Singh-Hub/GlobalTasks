"use client";

import { MotionButton } from "@/components/ui/motion-button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SurfacePanel } from "@/components/ui/surface-panel";
import { MessageCircle, Send } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

type Msg = { from: "you" | "support"; text: string; at: string };

const INITIAL: Msg[] = [
  { from: "support", text: "Hi — this is the TMS concierge. How can we help today?", at: new Date().toISOString() },
];

export default function ChatSupportPage() {
  const [messages, setMessages] = useState<Msg[]>(INITIAL);
  const [value, setValue] = useState("");

  const send = () => {
    if (!value.trim()) return;
    const now = new Date().toISOString();
    setMessages((prev) => [...prev, { from: "you", text: value.trim(), at: now }]);
    setValue("");
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { from: "support", text: "Got it. A specialist will jump in shortly — you can continue in the meantime.", at: new Date().toISOString() },
      ]);
    }, 700);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        chip="Concierge"
        icon={MessageCircle}
        title="Chat support"
        subtitle="Direct line to your workspace success team."
      />

      <SurfacePanel noPadding variant="gradient-border" className="flex min-h-[min(520px,70dvh)] max-h-[min(640px,78dvh)] flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-brand-50/30 to-transparent p-3 dark:from-brand-950/20 sm:p-5">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }}
              className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[min(92%,20rem)] rounded-2xl px-4 py-2.5 text-sm shadow-soft ${
                  m.from === "you"
                    ? "bg-brand-gradient text-white shadow-brand"
                    : "border border-zinc-100 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                {m.text}
                <div className={`mt-1 text-[10px] ${m.from === "you" ? "text-white/70" : "text-zinc-400"}`}>
                  {new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="safe-b flex items-center gap-2 border-t border-zinc-100 p-3 dark:border-zinc-800">
          <Input placeholder="Type a message…" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <MotionButton variant="gradient" className="shrink-0" onClick={send} aria-label="Send message">
            <Send className="h-4 w-4" />
          </MotionButton>
        </div>
      </SurfacePanel>
    </div>
  );
}
