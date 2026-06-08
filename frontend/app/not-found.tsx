import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200/80 bg-white/90 p-8 text-center shadow-soft backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="text-5xl font-bold text-brand-500">404</div>
        <h1 className="mt-3 text-lg font-bold text-zinc-900 dark:text-zinc-50">Page not found</h1>
        <p className="mt-2 text-sm text-zinc-500">This page doesn&apos;t exist or was moved.</p>
        <Link href="/dashboard" className="mt-6 inline-block">
          <Button variant="gradient">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
