/** Organisation hierarchy (1 = highest). */
export const USER_ROLES = ["ceo", "centre_head", "coordinator", "supervisor", "operations", "user", "executor"];

/** Maps legacy DB / JWT values to current roles. */
export const LEGACY_ROLE_MAP = {
  admin: "ceo",
  manager: "centre_head",
};

export const ROLE_RANK = {
  ceo: 1,
  centre_head: 2,
  coordinator: 3,
  supervisor: 4,
  operations: 5,
  user: 6,
  executor: 7,
};

/** Field staff: only their own assigned tasks (no team assign / management nav). */
export const ASSIGNEE_ONLY_ROLES = ["user", "executor"];

/** Everyone except field staff: team task views, assign work, masters, recycle, etc. */
export const MANAGEMENT_ROLES = ["ceo", "centre_head", "coordinator", "supervisor", "operations"];

/** Therapist / supervisor / coordinator sheet performance. */
export const CLINICAL_PERFORMANCE_ROLES = ["ceo", "centre_head", "coordinator", "supervisor", "operations"];

export const EXECUTOR_KINDS = ["", "therapist", "doctor", "reception", "marketing", "support", "security"];

export function normalizeRole(role) {
  if (!role || typeof role !== "string") return "executor";
  const lower = role.toLowerCase();
  if (LEGACY_ROLE_MAP[lower]) return LEGACY_ROLE_MAP[lower];
  return USER_ROLES.includes(lower) ? lower : "executor";
}

export function isManagement(role) {
  return MANAGEMENT_ROLES.includes(normalizeRole(role));
}

export function canViewClinicalPerformance(role) {
  return CLINICAL_PERFORMANCE_ROLES.includes(normalizeRole(role));
}

export function isAssigneeOnly(role) {
  return ASSIGNEE_ONLY_ROLES.includes(normalizeRole(role));
}

export function isCeo(role) {
  return normalizeRole(role) === "ceo";
}

/** More senior (lower rank number) may create/set strictly junior roles only. */
export function canAssignRole(actorRole, targetRole) {
  const a = normalizeRole(actorRole);
  const t = normalizeRole(targetRole);
  if (!USER_ROLES.includes(t)) return false;
  const ra = ROLE_RANK[a];
  const rt = ROLE_RANK[t];
  if (!ra || !rt) return false;
  return ra < rt;
}
