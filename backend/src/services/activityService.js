import { Activity } from "../models/Activity.js";

export async function logActivity({ actor, actorName, type, message, task, taskTitle, taskType, meta = {} }) {
  try {
    await Activity.create({ actor, actorName, type, message, task, taskTitle, taskType, meta });
  } catch {
    /* ignore */
  }
}
