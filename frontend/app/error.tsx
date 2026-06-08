"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200/80 bg-white/90 p-8 text-center shadow-soft backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
          !
        </div>
        <h1 className="mt-4 text-lg font-bold text-zinc-900 dark:text-zinc-50">Something went wrong</h1>
        <p className="mt-2 text-sm text-zinc-500">
          The page hit an error. You can try again or go back to the dashboard.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="gradient" onClick={() => reset()}>
            Try again
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
