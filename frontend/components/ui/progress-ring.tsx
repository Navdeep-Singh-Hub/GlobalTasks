"use client";

import { cn } from "@/lib/utils";
import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

export function ProgressRing({
  value,
  size = 88,
  stroke = 7,
  label,
  sublabel,
  tone = "brand",
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  tone?: "brand" | "emerald" | "amber" | "violet";
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const spring = useSpring(0, { stiffness: 80, damping: 18 });
  useEffect(() => {
    spring.set(clamped);
  }, [clamped, spring]);

  const dashOffset = useTransform(spring, (v) => circumference - (v / 100) * circumference);

  const toneStroke: Record<string, string> = {
    brand: "stroke-brand-500",
    emerald: "stroke-emerald-500",
    amber: "stroke-amber-500",
    violet: "stroke-violet-500",
  };

  const toneGlow: Record<string, string> = {
    brand: "drop-shadow-[0_0_8px_rgba(30,142,225,0.45)]",
    emerald: "drop-shadow-[0_0_8px_rgba(16,185,129,0.45)]",
    amber: "drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]",
    violet: "drop-shadow-[0_0_8px_rgba(139,92,246,0.4)]",
  };

  return (
    <div className={cn("relative inline-flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-zinc-200/80 dark:stroke-zinc-800"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className={cn(toneStroke[tone], toneGlow[tone])}
            strokeDasharray={circumference}
            style={{ strokeDashoffset: dashOffset }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{Math.round(clamped)}%</span>
        </div>
      </div>
      {label && <div className="mt-2 text-center text-xs font-semibold text-zinc-700 dark:text-zinc-200">{label}</div>}
      {sublabel && <div className="text-center text-[10px] text-zinc-500">{sublabel}</div>}
    </div>
  );
}

export function AnimatedProgressBar({
  value,
  tone = "brand",
  className,
  showLabel,
}: {
  value: number;
  tone?: "brand" | "emerald" | "amber" | "rose";
  className?: string;
  showLabel?: boolean;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const fill: Record<string, string> = {
    brand: "bg-brand-gradient",
    emerald: "bg-success-gradient",
    amber: "bg-warm-gradient",
    rose: "bg-gradient-to-r from-rose-500 to-pink-500",
  };

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-1 flex justify-between text-[10px] font-semibold text-zinc-500">
          <span>Progress</span>
          <span>{Math.round(clamped)}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <motion.div
          className={cn("h-full rounded-full", fill[tone])}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}
