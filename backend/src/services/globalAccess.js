/**
 * Accounts that see every center's data. These are treated as CEO at login /me,
 * so all `isCeo(req.userRole)` center scoping across routes is bypassed for them.
 */
export const GLOBAL_ACCESS_EMAILS = [
  "admin@globaltasks.demo",
  "testing@gmail.com",
  "gcwcethics@gmail.com",
  "mandeep@gmail.com",
];

export function isGlobalAccessEmail(email) {
  return GLOBAL_ACCESS_EMAILS.includes(String(email || "").trim().toLowerCase());
}
