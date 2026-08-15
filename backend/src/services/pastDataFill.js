import { User } from "../models/User.js";

/** May fill past sessions, sheets, and tasks on behalf of any user. */
export const PAST_DATA_FILL_EMAILS = ["manjot1104@gmail.com"];

export function isPastDataFillEmail(email) {
  return PAST_DATA_FILL_EMAILS.includes(String(email || "").trim().toLowerCase());
}

export async function canFillPastDataOnBehalf(userId, email) {
  if (isPastDataFillEmail(email)) return true;
  if (!userId) return false;
  const u = await User.findById(userId).select("email").lean();
  return isPastDataFillEmail(u?.email);
}

/** Resolve actor email from req (cached lean actor or DB). */
export async function actorCanFillPastData(req, me) {
  const email = me?.email || req._actor?.email;
  if (isPastDataFillEmail(email)) return true;
  if (email === undefined && req.userId) {
    return canFillPastDataOnBehalf(req.userId);
  }
  return canFillPastDataOnBehalf(req.userId, email);
}
