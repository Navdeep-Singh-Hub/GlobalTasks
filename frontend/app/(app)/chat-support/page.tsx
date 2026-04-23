"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send } from "lucide-react";
import { useState } from "react";

type Msg = { from: "you" | "support"; text: string; at: string };

const INITIAL: Msg[] = [
  { from: "support", text: "Hi Ravish — this is the TMS concierge. How can we help today?", at: new Date().toISOString() },
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
    <div className="space-y-5">
      <div>
        <div className="chip border border-zinc-200 bg-white text-zinc-500">
          <MessageCircle className="h-3 w-3" /> Concierge
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Chat support</h1>
        <p className="mt-1 text-sm text-zinc-500">Direct line to your workspace success team.</p>
      </div>

      <div className="flex min-h-[min(520px,70dvh)] max-h-[min(640px,78dvh)] flex-col overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl">
        <div className="flex-1 space-y-3 overflow-y-auto bg-surface-muted/60 p-3 dark:bg-zinc-900/40 sm:p-5">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[min(92%,20rem)] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                  m.from === "you"
                    ? "bg-brand-gradient text-white"
                    : "bg-white text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                {m.text}
                <div className={`mt-1 text-[10px] ${m.from === "you" ? "text-white/70" : "text-zinc-400"}`}>
                  {new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="safe-b flex items-center gap-2 border-t border-zinc-100 p-3 dark:border-zinc-800">
          <Input placeholder="Type a message…" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <Button variant="gradient" className="shrink-0" onClick={send} aria-label="Send message"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
