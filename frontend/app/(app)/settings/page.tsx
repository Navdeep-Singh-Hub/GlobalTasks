"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { formatRoleLine } from "@/lib/roles";
import { Settings as SettingsIcon, UserCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountErr, setAccountErr] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);

  useEffect(() => {
    setPhone(user?.phone || "");
  }, [user?.phone, user?._id]);

  const saveAccount = async () => {
    setAccountErr("");
    if (!user?._id) return;
    if (newPassword || confirmPassword) {
      if (newPassword !== confirmPassword) {
        setAccountErr("New password and confirmation do not match.");
        return;
      }
    }
    setAccountSaving(true);
    try {
      const pwd = newPassword.trim();
      await api(`/users/${user._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          phone,
          ...(pwd ? { password: pwd } : {}),
        }),
      });
      setNewPassword("");
      setConfirmPassword("");
      await refreshUser();
    } catch (e) {
      setAccountErr(e instanceof ApiError ? e.message : "Could not update account.");
    } finally {
      setAccountSaving(false);
    }
  };

  const profileCard = {
    icon: UserCircle2,
    title: "Profile",
    desc: "Your name, avatar, and contact info are visible across the workspace.",
    body: (
      <div className="space-y-3 text-[12.5px] text-zinc-600 dark:text-zinc-300">
        <div>
          <span className="font-semibold">Name:</span> {user?.name}
        </div>
        <div>
          <span className="font-semibold">Email:</span> {user?.email}
        </div>
        <div>
          <span className="font-semibold">Role:</span> <span>{user ? formatRoleLine(user.role, user.executorKind) : "—"}</span>
        </div>
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">Phone & password</div>
          <div className="mt-2 grid gap-2">
            <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input
              type="password"
              placeholder="New password (optional)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {accountErr && <div className="mt-2 text-[11px] font-medium text-rose-600">{accountErr}</div>}
          <Button type="button" variant="gradient" className="mt-3 w-full sm:w-auto" onClick={() => void saveAccount()} disabled={accountSaving}>
            {accountSaving ? "Saving…" : "Save phone & password"}
          </Button>
        </div>
      </div>
    ),
  };

  const ProfileCardIcon = profileCard.icon;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="chip border border-zinc-200 bg-white text-zinc-500">
            <SettingsIcon className="h-3 w-3" /> Preferences
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">Profile and theme preferences.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
          <span className="px-3 text-xs text-zinc-500">Theme</span>
          <ThemeToggle />
        </div>
      </div>

      <div className="max-w-xl">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600">
            <ProfileCardIcon className="h-5 w-5" />
          </div>
          <div className="mt-3 text-sm font-bold">{profileCard.title}</div>
          <div className="mt-1 text-xs text-zinc-500">{profileCard.desc}</div>
          <div className="mt-3">{profileCard.body}</div>
        </div>
      </div>
    </div>
  );
}
