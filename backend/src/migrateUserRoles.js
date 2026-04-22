import { User } from "./models/User.js";
import { LEGACY_ROLE_MAP } from "./constants/roles.js";

/** One-time style migration: old admin/manager/user strings → hierarchy roles. */
export async function migrateLegacyUserRoles() {
  for (const [from, to] of Object.entries(LEGACY_ROLE_MAP)) {
    const r = await User.updateMany({ role: from }, { $set: { role: to } });
    if (r.modifiedCount) console.log(`[migrate] Updated ${r.modifiedCount} user(s): ${from} → ${to}`);
  }
}
