import { Center } from "../models/Center.js";
import { isCeo } from "../constants/roles.js";
import { isGlobalAccessEmail } from "./globalAccess.js";

/**
 * These logins can see every record in the named centers, plus their own center.
 * null from accessibleCenterIds means unrestricted (CEO / global access).
 */
export const EXTRA_CENTER_ACCESS_BY_EMAIL = {
  "sachin@gmail.com": ["Barnala", "Amritsar", "Moga", "Faridkot"],
};

export function extraCenterNamesForEmail(email) {
  const names = EXTRA_CENTER_ACCESS_BY_EMAIL[String(email || "").trim().toLowerCase()];
  return names ? [...names] : null;
}

export async function resolveCenterIdsByNames(names) {
  if (!names?.length) return [];
  const centers = await Center.find({
    name: { $in: names.map((name) => new RegExp(`^${String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) },
  })
    .select("_id")
    .lean();
  return centers.map((center) => center._id);
}

/**
 * @returns {Promise<null | import("mongoose").Types.ObjectId[]>}
 * null = every center.
 */
export async function accessibleCenterIds({ role, email, centerId }) {
  if (isCeo(role) || isGlobalAccessEmail(email)) return null;
  const ids = [];
  if (centerId) ids.push(centerId);
  const extraNames = extraCenterNamesForEmail(email);
  if (extraNames) ids.push(...(await resolveCenterIdsByNames(extraNames)));
  const seen = new Set();
  const unique = [];
  for (const id of ids) {
    const key = String(id || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(id);
  }
  return unique;
}

export function centerClause(ids) {
  if (ids == null) return {};
  if (!ids.length) return { centerId: null };
  if (ids.length === 1) return { centerId: ids[0] };
  return { centerId: { $in: ids } };
}

export function centerIdAllowed(ids, centerId) {
  if (ids == null) return true;
  const key = String(centerId?._id || centerId || "");
  return ids.some((id) => String(id) === key);
}
