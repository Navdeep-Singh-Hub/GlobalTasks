"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to sign in. Check API server and network.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="safe-x safe-b relative flex min-h-[100dvh] min-h-screen items-center justify-center overflow-x-hidden bg-surface-muted px-4 py-10 sm:py-12 dark:bg-[#0b1220]">
      <div className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full bg-brand-gradient-soft blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-accent-cyan/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative grid w-full max-w-[min(100%,1100px)] overflow-hidden rounded-[22px] border border-zinc-200/80 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.18)] sm:rounded-[28px] md:grid-cols-[1.05fr_1fr] dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="relative hidden overflow-hidden bg-brand-gradient p-10 text-white md:block">
          <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">
              <Sparkles className="h-3 w-3" /> GlobalTasks TMS
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight">
              Run every<br />recurring task<br />with one view.
            </h1>
            <p className="mt-4 max-w-sm text-sm text-white/85">
              Assign daily, weekly and one-time work, route approvals, and see the whole team&apos;s pending queue at a glance.
            </p>
            <ul className="mt-8 space-y-2.5 text-[13px] text-white/90">
              {["Kanban, table and calendar views", "Voice notes and attachments", "Admin approval workflow", "Role-based permissions"].map((x) => (
                <li key={x} className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-[10px]">✓</span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="p-6 sm:p-8 md:p-10">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-zinc-500">Sign in to continue to your workspace.</p>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-200">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <Input required type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-200">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <Input required type={show ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-10" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-2 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

            <Button type="submit" variant="gradient" className="h-11 w-full text-base" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-[11.5px] text-zinc-500">
            New here?{" "}
            <Link href="/register" className="font-semibold text-brand-600 hover:underline">Create an account</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
