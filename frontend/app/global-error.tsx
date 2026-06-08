"use client";

import { useEffect } from "react";

/** Catches errors in the root layout. Must define its own html/body. */
export default function GlobalError({
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
    <html lang="en">
      <body className="min-h-[100dvh] bg-[#f4f7fc] font-sans antialiased">
        <div className="flex min-h-[100dvh] items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-lg">
            <h1 className="text-lg font-bold text-zinc-900">Application error</h1>
            <p className="mt-2 text-sm text-zinc-500">A critical error occurred. Please refresh the page.</p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 rounded-xl bg-[#1e8ee1] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#147ace]"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
