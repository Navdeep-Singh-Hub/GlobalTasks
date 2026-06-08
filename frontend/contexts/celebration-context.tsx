"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, PartyPopper, Rocket, Sparkles, Trophy } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type CelebrationKind = "complete" | "submit" | "approve" | "assign" | "not_done";

type CelebrationState = {
  kind: CelebrationKind;
  message: string;
  subtitle?: string;
};

type CelebrationContextValue = {
  celebrate: (kind: CelebrationKind, message?: string, subtitle?: string) => void;
};

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

const COMPLETE_MESSAGES = [
  "Great job!",
  "You completed today's goal!",
  "You're making excellent progress!",
  "Level up!",
  "Achievement unlocked!",
  "Task completed!",
  "Crushing it!",
  "Momentum unlocked!",
];

const PRESETS: Record<CelebrationKind, { message: string; subtitle: string; icon: typeof Trophy; gradient: string }> = {
  complete: {
    message: "Task completed!",
    subtitle: "You crushed it — keep the momentum going.",
    icon: Trophy,
    gradient: "from-emerald-500 to-teal-400",
  },
  submit: {
    message: "Submitted for approval!",
    subtitle: "Your work is on its way to your assigner.",
    icon: Rocket,
    gradient: "from-brand-500 to-accent-cyan",
  },
  approve: {
    message: "Approved!",
    subtitle: "Great teamwork — task marked complete.",
    icon: CheckCircle2,
    gradient: "from-emerald-500 to-brand-400",
  },
  assign: {
    message: "Task assigned!",
    subtitle: "Your team has been notified.",
    icon: Sparkles,
    gradient: "from-violet-500 to-brand-500",
  },
  not_done: {
    message: "Marked as not done",
    subtitle: "Sent to your assigner for review.",
    icon: PartyPopper,
    gradient: "from-amber-500 to-orange-400",
  },
};

const CONFETTI_COLORS = ["#1e8ee1", "#22c4d4", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e", "#f5b942"];

function ConfettiBurst() {
  const particles = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 100,
        y: (Math.random() - 0.5) * 60 - 20,
        rotate: Math.random() * 720,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 8,
        delay: Math.random() * 0.15,
        duration: 0.8 + Math.random() * 0.6,
      })),
    []
  );

  return (
    <>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="confetti-particle"
          style={{
            left: "50%",
            top: "40%",
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{
            x: p.x * 8,
            y: p.y * 6 + 200,
            opacity: 0,
            rotate: p.rotate,
            scale: 0.3,
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

function CelebrationOverlay({ state, onClose }: { state: CelebrationState | null; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  const preset = state ? PRESETS[state.kind] : null;
  const Icon = preset?.icon || Trophy;

  return createPortal(
    <AnimatePresence>
      {state && preset && (
        <motion.div
          key="celebration"
          className="fixed inset-0 z-[500] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            aria-label="Dismiss celebration"
            onClick={onClose}
          />
          <ConfettiBurst />
          <motion.div
            className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-white/30 bg-white/95 p-8 text-center shadow-elevated backdrop-blur-xl dark:border-zinc-700/50 dark:bg-zinc-950/95"
            initial={{ scale: 0.7, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <div
              className={`mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br ${preset.gradient} shadow-glow-emerald animate-celebrate-pop`}
            >
              <Icon className="h-10 w-10 text-white drop-shadow-md" strokeWidth={2.2} />
            </div>
            <h3 className="mt-5 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {state.message || preset.message}
            </h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {state.subtitle || preset.subtitle}
            </p>
            <motion.button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-brand-gradient py-3 text-sm font-bold text-white shadow-brand transition hover:brightness-105 active:scale-[0.98]"
              whileTap={{ scale: 0.97 }}
            >
              Continue
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CelebrationState | null>(null);

  const celebrate = useCallback((kind: CelebrationKind, message?: string, subtitle?: string) => {
    const defaultMessage =
      kind === "complete" && !message
        ? COMPLETE_MESSAGES[Math.floor(Math.random() * COMPLETE_MESSAGES.length)]
        : PRESETS[kind].message;
    setState({ kind, message: message || defaultMessage, subtitle });
    window.setTimeout(() => setState(null), 3200);
  }, []);

  const value = useMemo(() => ({ celebrate }), [celebrate]);

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      <CelebrationOverlay state={state} onClose={() => setState(null)} />
    </CelebrationContext.Provider>
  );
}

export function useCelebration() {
  const ctx = useContext(CelebrationContext);
  if (!ctx) {
    return { celebrate: () => {} };
  }
  return ctx;
}
