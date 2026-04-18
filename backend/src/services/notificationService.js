import { Notification } from "../models/Notification.js";

let ioRef = null;
export function setSocket(io) { ioRef = io; }

export async function createNotification({ userId, type, title, message, link = "" }) {
  const notif = await Notification.create({ user: userId, type, title, message, link });
  if (ioRef) ioRef.to(`user:${userId}`).emit("notification:new", notif);
  return notif;
}

export async function notifyMany(userIds, payload) {
  await Promise.all(userIds.map((id) => createNotification({ userId: id, ...payload })));
}
