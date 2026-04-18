"use client";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge, roleTone } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CreditCard,
  Filter,
  Info,
  Lock,
  Pencil,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Member = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: "admin" | "manager" | "user";
  department?: string;
  permissions: string[];
  active: boolean;
  deactivatedAt?: string | null;
  lastAccessAt?: string | null;
  title?: string;
  avatarUrl?: string;
};

const ALL_PERMISSIONS = [
  "view_tasks",
  "assign_tasks",
  "view_all_team_tasks",
  "approve_tasks",
  "manage_users",
  "manage_departments",
  "manage_billing",
  "export_reports",
  "delete_tasks",
];

function PermissionPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (p: string) => void;
}) {
  return (
    <div className="mt-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Permissions</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ALL_PERMISSIONS.map((p) => {
          const on = selected.includes(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => onToggle(p)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${on ? "bg-brand-gradient text-white shadow-brand" : "border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900"}`}
            >
              {p.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminPanelPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [role, setRole] = useState("all");
  const [dept, setDept] = useState("all");
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status !== "all") qs.set("status", status);
    if (role !== "all") qs.set("role", role);
    if (dept !== "all") qs.set("department", dept);
    api<{ users: Member[] }>(`/users?${qs.toString()}`)
      .then((d) => setMembers(d.users))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [search, status, role, dept]);

  useEffect(() => {
    load();
    api<{ departments: string[] }>("/users/departments").then((d) => setDepartments(d.departments)).catch(() => setDepartments([]));
  }, [load]);

  const toggleActive = async (m: Member) => {
    await api(`/users/${m._id}`, { method: "PATCH", body: JSON.stringify({ active: !m.active }) });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-brand">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
              <p className="text-xs text-zinc-500">Govern workspace access, roles and permissions.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2"><CreditCard className="h-4 w-4" /> View Plan</Button>
            <Button variant="gradient" className="gap-2" onClick={() => setCreateOpen(true)}><UserPlus className="h-4 w-4" /> Create User</Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
            <Input placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="user">User</option>
          </Select>
          <Select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-100 p-5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-500" />
            <h2 className="text-sm font-bold">User Management ({members.length})</h2>
          </div>
          <Filter className="h-4 w-4 text-zinc-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-[12.5px]">
            <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.08em] text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="p-3 text-left">User</th>
                <th className="p-3 text-left">Role</th>
                <th className="p-3 text-left">Department</th>
                <th className="p-3 text-left">Permissions</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Last Access</th>
                <th className="p-3 text-left">Deactivated Info</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-10 text-center text-xs text-zinc-400">Loading users…</td></tr>
              ) : members.length === 0 ? (
                <tr><td colSpan={8} className="p-10 text-center text-xs text-zinc-400">No users found.</td></tr>
              ) : (
                members.map((m) => (
                  <tr key={m._id} className="border-t border-zinc-100 transition-colors hover:bg-brand-50/40 dark:border-zinc-800 dark:hover:bg-brand-900/10">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-brand">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-zinc-800 dark:text-zinc-100">{m.name}</div>
                          <div className="text-[11px] text-zinc-500">{m.phone || "—"}</div>
                          <div className="text-[11px] text-zinc-500">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3"><Badge tone={roleTone(m.role)}>{m.role}</Badge></td>
                    <td className="p-3 text-zinc-700 dark:text-zinc-200">{m.department || <span className="text-zinc-400">No Department</span>}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {(m.permissions || []).slice(0, 2).map((p) => (
                          <span key={p} className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900/40 dark:bg-sky-900/30 dark:text-sky-200">
                            {p.replace(/_/g, " ")}
                          </span>
                        ))}
                        {m.permissions.length > 2 && (
                          <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            +{m.permissions.length - 2} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge tone={m.active ? "emerald" : "zinc"}>{m.active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="p-3 text-zinc-700 dark:text-zinc-200">
                      {m.lastAccessAt ? (
                        <div>
                          <div>{new Date(m.lastAccessAt).toLocaleDateString()}</div>
                          <div className="text-[11px] text-zinc-500">{new Date(m.lastAccessAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-zinc-400"><Info className="h-3 w-3" /> No data</span>
                      )}
                    </td>
                    <td className="p-3 text-zinc-500">—</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setEditing(m)} className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-brand-600 dark:hover:bg-zinc-800" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            const pwd = prompt("Reset password to:", "welcome123");
                            if (pwd) await api(`/users/${m._id}/reset-password`, { method: "POST", body: JSON.stringify({ password: pwd }) });
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-amber-600 dark:hover:bg-zinc-800"
                          title="Reset password"
                        >
                          <Lock className="h-3.5 w-3.5" />
                        </button>
                        <button
                          role="switch"
                          aria-checked={m.active}
                          onClick={() => toggleActive(m)}
                          className={`relative h-5 w-9 rounded-full transition ${m.active ? "bg-brand-gradient" : "bg-zinc-300 dark:bg-zinc-700"}`}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${m.active ? "left-[18px]" : "left-0.5"}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); load(); }}
        />
      )}
      {editing && (
        <EditUserModal
          key={editing._id}
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "user",
    department: "",
    title: "",
    avatarUrl: "",
    password: "welcome123",
    permissions: ["view_tasks"] as string[],
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const togglePerm = (p: string) =>
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p],
    }));

  const submit = async () => {
    setSaving(true);
    setErr("");
    try {
      await api("/users", { method: "POST", body: JSON.stringify(form) });
      onCreated();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="Create User" onClose={onClose} className="max-w-2xl">
      <div className="grid gap-3 md:grid-cols-2">
        <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        <Input placeholder="Job title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input placeholder="Avatar image URL (optional)" value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} />
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="user">User</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </Select>
        <Input placeholder="Initial password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </div>
      <PermissionPicker selected={form.permissions} onToggle={togglePerm} />
      {err && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{err}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="gradient" onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create user"}</Button>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: Member; onClose: () => void; onSaved: () => void }) {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin";

  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    department: user.department || "",
    title: user.title || "",
    avatarUrl: user.avatarUrl || "",
    role: user.role,
    permissions: [...(user.permissions || [])],
    active: user.active !== false,
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const togglePerm = (p: string) =>
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p],
    }));

  const submit = async () => {
    setErr("");
    if (newPassword || confirmPassword) {
      if (newPassword !== confirmPassword) {
        setErr("New password and confirmation do not match.");
        return;
      }
      if (!isAdmin) {
        setErr("Only admins can change passwords from here.");
        return;
      }
    }
    setSaving(true);
    try {
      await api(`/users/${user._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone,
          department: form.department,
          title: form.title,
          avatarUrl: form.avatarUrl,
          role: form.role,
          permissions: form.permissions,
          active: form.active,
        }),
      });
      if (isAdmin && newPassword.trim()) {
        await api(`/users/${user._id}/reset-password`, {
          method: "POST",
          body: JSON.stringify({ password: newPassword.trim() }),
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={`Edit ${user.name}`} onClose={onClose} className="max-w-2xl">
      <div className="grid gap-3 md:grid-cols-2">
        <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        <Input placeholder="Job title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input placeholder="Avatar image URL (optional)" value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} />
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Member["role"] })}>
          <option value="user">User</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </Select>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/60">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-300 text-brand-600"
          />
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Account active</span>
        </label>
      </div>

      {isAdmin && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Set new password (optional)</div>
          <p className="mt-1 text-[11px] text-zinc-500">Leave blank to keep the current password.</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
      )}

      <PermissionPicker selected={form.permissions} onToggle={togglePerm} />

      {err && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">{err}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="gradient" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </Modal>
  );
}
