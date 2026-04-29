/**
 * Only these departments exist in the product. Codes are unique; slug matches User.department free text (lowercase).
 */
export const ALLOWED_DEPARTMENTS = [
  { name: "OT", code: "OT", slug: "ot" },
  { name: "BT", code: "BT", slug: "bt" },
  { name: "Speech", code: "SPE", slug: "speech" },
  { name: "CBT", code: "CBT", slug: "cbt" },
  { name: "DT", code: "DT", slug: "dt" },
  { name: "Reception", code: "REC", slug: "reception" },
  { name: "Marketing", code: "MKT", slug: "marketing" },
  { name: "Operations", code: "OPS", slug: "operations" },
  { name: "Software", code: "SW", slug: "software" },
  { name: "Digital", code: "DIG", slug: "digital" },
  { name: "House Keeping", code: "HK", slug: "house keeping" },
  { name: "Security", code: "SEC", slug: "security" },
  { name: "Admin", code: "ADM", slug: "admin" },
];

export const ALLOWED_DEPARTMENT_CODES = new Set(ALLOWED_DEPARTMENTS.map((d) => d.code));

const SLUG_SET = new Set(ALLOWED_DEPARTMENTS.map((d) => d.slug));

/** Sorted slugs for filters and user text field */
export const ALLOWED_DEPARTMENT_SLUGS = [...SLUG_SET].sort();

export function isAllowedDepartmentCode(code) {
  return ALLOWED_DEPARTMENT_CODES.has(String(code || "").toUpperCase());
}

export function isAllowedDepartmentSlug(slug) {
  if (!slug || typeof slug !== "string") return true;
  return SLUG_SET.has(String(slug).trim().toLowerCase());
}

export function canonicalDepartmentByCode(code) {
  return ALLOWED_DEPARTMENTS.find((d) => d.code === String(code || "").toUpperCase()) || null;
}
