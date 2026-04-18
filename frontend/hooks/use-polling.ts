"use client";

import { useEffect } from "react";

export function usePolling(callback: () => void, ms: number, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(callback, ms);
    return () => window.clearInterval(id);
  }, [callback, ms, enabled]);
}
