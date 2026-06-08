"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { forwardRef, useEffect, useState, type ComponentProps } from "react";

type MotionButtonProps = ComponentProps<typeof Button> & {
  loading?: boolean;
  success?: boolean;
  successDurationMs?: number;
};

export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(function MotionButton(
  { loading, success, successDurationMs = 1800, children, className, disabled, variant, ...props },
  ref
) {
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!success) {
      setShowSuccess(false);
      return;
    }
    setShowSuccess(true);
    const t = window.setTimeout(() => setShowSuccess(false), successDurationMs);
    return () => window.clearTimeout(t);
  }, [success, successDurationMs]);

  const isBusy = loading || showSuccess;

  return (
    <Button
      ref={ref}
      variant={showSuccess ? "success" : variant}
      disabled={disabled || loading}
      className={cn("relative overflow-hidden", showSuccess && "animate-wiggle", className)}
      {...props}
    >
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.span key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-2">
            <Spinner className="h-4 w-4 border-white/30 border-t-white" />
            Working…
          </motion.span>
        ) : showSuccess ? (
          <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-2">
            <Check className="h-4 w-4" strokeWidth={3} />
            Done!
          </motion.span>
        ) : (
          <motion.span key="label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {children}
          </motion.span>
        )}
      </AnimatePresence>
      {!isBusy && (
        <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100">
          <span className="btn-shimmer absolute inset-0 animate-shimmer" />
        </span>
      )}
    </Button>
  );
});
