"use client";

import { CheckCircle2, PartyPopper, Rocket, Sparkles, Trophy } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  { message: string; subtitle: string; icon: typeof Trophy; gradient: string }
> = {
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

const AUTO_DISMISS_MS: Partial<Record<CelebrationKind, number>> = {
  assign: 2800,
  not_done: 3200,
};

const OVERLAY_Z = 2_147_483_647;

function getCelebrationPortalRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let root = document.getElementById("celebration-portal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "celebration-portal-root";
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);
  }
  return root;
}

function CelebrationOverlay({ state, onClose }: { state: CelebrationState | null; onClose: () => void }) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(getCelebrationPortalRoot());
  }, []);

  useEffect(() => {
    if (!state) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state]);

  if (!portalRoot || !state) return null;

  const preset = PRESETS[state.kind];
  const Icon = preset.icon;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
      style={{ position: "fixed", inset: 0, zIndex: OVERLAY_Z }}
    >
      {/* Backdrop — tap outside card to dismiss */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
        className="border-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Dialog — always above backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}
      >
        <div
          className="celebration-card w-full max-w-md rounded-3xl border-2 border-white/40 bg-white p-8 text-center shadow-elevated dark:border-zinc-600/50 dark:bg-zinc-950"
          style={{ pointerEvents: "auto" }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div
            className={`mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br ${preset.gradient} shadow-brand`}
          >
            <Icon className="h-11 w-11 text-white drop-shadow-lg" strokeWidth={2.4} />
          </div>
          <h3
            id="celebration-title"
            className="mt-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl"
          >
            {state.message || preset.message}
          </h3>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 sm:text-base">
            {state.subtitle || preset.subtitle}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="relative z-[2] mt-7 w-full cursor-pointer rounded-xl bg-brand-gradient py-3.5 text-base font-bold text-white shadow-brand transition hover:brightness-105 active:scale-[0.98]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>,
    portalRoot
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
