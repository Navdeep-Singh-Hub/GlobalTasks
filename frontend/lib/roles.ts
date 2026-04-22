/** Mirrors backend `constants/roles.js` — organisation hierarchy. */

export const USER_ROLES = ["ceo", "centre_head", "coordinator", "supervisor", "executor"] as const;
export type Role = (typeof USER_ROLES)[number];

export const MANAGEMENT_ROLES: Role[] = ["ceo", "centre_head", "coordinator", "supervisor"];

export const ROLE_LABELS: Record<Role, string> = {
  ceo: "CEO",
  centre_head: "Centre Head",
  coordinator: "Coordinator",
  supervisor: "Supervisor",
  executor: "Executor",
};

export const EXECUTOR_KIND_LABELS: Record<string, string> = {
  therapist: "Therapist",
  reception: "Reception",
  marketing: "Marketing",
  support: "Support",
};

export const EXECUTOR_KIND_OPTIONS = ["therapist", "reception", "marketing", "support"] as const;

/** Roles this actor may assign when creating/editing users (same rank or more junior). */
export function rolesAssignableBy(actor: Role): Role[] {
  const idx = USER_ROLES.indexOf(actor);
  if (idx < 0) return ["executor"];
  return [...USER_ROLES.slice(idx)];
}

export function isManagement(role: string | undefined): boolean {
  return !!role && MANAGEMENT_ROLES.includes(role as Role);
}

export function isCeo(role: string | undefined): boolean {
  return role === "ceo";
}

export function formatRoleLine(role: string | undefined, executorKind?: string): string {
  if (!role) return "—";
  const base = ROLE_LABELS[role as Role] || role.replace(/_/g, " ");
  if (role === "executor" && executorKind && EXECUTOR_KIND_LABELS[executorKind]) {
    return `${base} · ${EXECUTOR_KIND_LABELS[executorKind]}`;
  }
  return base;
}

/** Nav / feature gates */
export const NAV_ALL: Role[] = [...USER_ROLES];

export const NAV_MANAGEMENT: Role[] = [...MANAGEMENT_ROLES];

export const NAV_CEO_ONLY: Role[] = ["ceo"];
