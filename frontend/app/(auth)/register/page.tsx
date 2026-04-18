"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useAuth, type Role } from "@/contexts/auth-context";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Mail, Sparkles, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({ name, email, password, role });
      router.replace("/dashboard");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to register. Check API server and network.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-muted px-4 py-12 dark:bg-[#0b1220]">
      <div className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full bg-brand-gradient-soft blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-accent-cyan/10 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="rounded-[24px] border border-zinc-200/80 bg-white p-8 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.18)] dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">
            <Sparkles className="h-3 w-3" /> GlobalTasks
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-zinc-500">Start orchestrating recurring work in minutes.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold">Full name</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <Input required value={name} onChange={(e) => setName(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold">Email address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold">Role</label>
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="user">User</option>
                <option value="manager">Manager</option>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <Input required type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-10" />
                <button type="button" className="absolute right-2 top-2 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setShow((s) => !s)}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            <Button type="submit" variant="gradient" className="h-11 w-full text-base" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-[11.5px] text-zinc-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-600 hover:underline">Sign in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
