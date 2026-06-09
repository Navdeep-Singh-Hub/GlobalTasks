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

const SUBMIT_MESSAGES = [
  "Submitted for approval!",
  "Sent to your assigner!",
  "Nice work — awaiting approval!",
  "Submission received!",
];

const PRESETS: Record<
  CelebrationKind,
  { message: string; subtitle: string; icon: typeof Trophy; gradient: string; flash: string; glow: string }
> = {
  complete: {
    message: "Task completed!",
    subtitle: "You crushed it — keep the momentum going.",
    icon: Trophy,
    gradient: "from-emerald-500 to-teal-400",
    flash: "bg-emerald-400/30",
    glow: "shadow-glow-emerald",
  },
  submit: {
    message: "Submitted for approval!",
    subtitle: "Your work is on its way to your assigner.",
    icon: Rocket,
    gradient: "from-brand-500 to-accent-cyan",
    flash: "bg-brand-400/35",
    glow: "shadow-glow",
  },
  approve: {
    message: "Approved!",
    subtitle: "Great teamwork — task marked complete.",
    icon: CheckCircle2,
    gradient: "from-emerald-500 to-brand-400",
    flash: "bg-emerald-400/30",
    glow: "shadow-glow-emerald",
  },
  assign: {
    message: "Task assigned!",
    subtitle: "Your team has been notified.",
    icon: Sparkles,
    gradient: "from-violet-500 to-brand-500",
    flash: "bg-violet-400/25",
    glow: "shadow-glow-violet",
  },
  not_done: {
    message: "Marked as not done",
    subtitle: "Sent to your assigner for review.",
    icon: PartyPopper,
    gradient: "from-amber-500 to-orange-400",
    flash: "bg-amber-400/25",
    glow: "shadow-soft",
  },
};

const CONFETTI_COLORS = ["#1e8ee1", "#22c4d4", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e", "#f5b942"];

const AUTO_DISMISS_MS: Partial<Record<CelebrationKind, number>> = {
  assign: 2800,
  not_done: 3200,
};

function ConfettiBurst({ intense = false }: { intense?: boolean }) {
  const count = intense ? 90 : 56;
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const spread = 120 + Math.random() * 180;
        return {
          id: i,
          x: Math.cos(angle) * spread * (0.4 + Math.random() * 0.6),
          y: Math.sin(angle) * spread * 0.5 + 80 + Math.random() * 120,
          rotate: Math.random() * 720,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          size: intense ? 8 + Math.random() * 10 : 6 + Math.random() * 8,
          delay: Math.random() * 0.2,
          duration: 1 + Math.random() * 0.9,
          originX: 20 + Math.random() * 60,
          originY: 25 + Math.random() * 35,
        };
      }),
    [count, intense]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="confetti-particle rounded-sm"
          style={{
            left: `${p.originX}%`,
            top: `${p.originY}%`,
            width: p.size,
            height: p.size * 0.65,
            backgroundColor: p.color,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{
            x: p.x,
            y: p.y,
            opacity: [1, 1, 0],
            rotate: p.rotate,
            scale: [1, 1.2, 0.4],
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

function CelebrationOverlay({ state, onClose }: { state: CelebrationState | null; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  const preset = state ? PRESETS[state.kind] : null;
  const Icon = preset?.icon || Trophy;
  const intense = state?.kind === "submit" || state?.kind === "complete" || state?.kind === "approve";

  return createPortal(
    <AnimatePresence>
      {state && preset && (
        <motion.div
          key="celebration"
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className={`pointer-events-none absolute inset-0 ${preset.flash}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0.35] }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
            aria-label="Dismiss celebration"
            onClick={onClose}
          />
          <ConfettiBurst intense={intense} />
          <motion.div
            className="celebration-card relative z-10 w-full max-w-md overflow-hidden rounded-3xl border-2 border-white/40 bg-white p-8 text-center shadow-elevated dark:border-zinc-600/50 dark:bg-zinc-950"
            initial={{ scale: 0.5, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 420, damping: 20 }}
          >
            <motion.div
              className="pointer-events-none absolute -inset-1 rounded-3xl bg-brand-gradient opacity-20 blur-xl"
              animate={{ opacity: [0.15, 0.35, 0.15] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative">
              <motion.div
                className={`relative mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br ${preset.gradient} ${preset.glow}`}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: [0, 1.15, 1], rotate: 0 }}
                transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <motion.span
                  className="absolute inset-0 rounded-3xl border-4 border-white/40"
                  animate={{ scale: [1, 1.35, 1.5], opacity: [0.7, 0.25, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                />
                <Icon className="relative h-11 w-11 text-white drop-shadow-lg" strokeWidth={2.4} />
              </motion.div>
              <motion.h3
                className="mt-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.35 }}
              >
                {state.message || preset.message}
              </motion.h3>
              <motion.p
                className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 sm:text-base"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.35 }}
              >
                {state.subtitle || preset.subtitle}
              </motion.p>
              <motion.button
                type="button"
                onClick={onClose}
                className="mt-7 w-full rounded-xl bg-brand-gradient py-3.5 text-base font-bold text-white shadow-brand transition hover:brightness-105 active:scale-[0.98]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.3 }}
                whileTap={{ scale: 0.97 }}
              >
                Continue
              </motion.button>
            </div>
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
    let defaultMessage = PRESETS[kind].message;
    if (kind === "complete" && !message) {
      defaultMessage = COMPLETE_MESSAGES[Math.floor(Math.random() * COMPLETE_MESSAGES.length)];
    } else if (kind === "submit" && !message) {
      defaultMessage = SUBMIT_MESSAGES[Math.floor(Math.random() * SUBMIT_MESSAGES.length)];
    }
    setState({ kind, message: message || defaultMessage, subtitle });

    const autoMs = AUTO_DISMISS_MS[kind];
    if (autoMs) {
      window.setTimeout(() => setState(null), autoMs);
    }
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
