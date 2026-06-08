"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function AppError({
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
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200/80 bg-white/90 p-6 text-center shadow-soft backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Couldn&apos;t load this page</h2>
        <p className="mt-2 text-sm text-zinc-500">Try again or return to your dashboard.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="gradient" size="sm" onClick={() => reset()}>
            Try again
          </Button>
          <Button variant="outline" size="sm" onClick={() => (window.location.href = "/dashboard")}>
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
