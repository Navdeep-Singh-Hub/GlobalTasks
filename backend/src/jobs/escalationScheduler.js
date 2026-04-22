import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { Escalation } from "../models/Escalation.js";
import { notifyMany } from "../services/notificationService.js";

const HOUR_MS = 3600_000;

function escalationLevelForAge(hoursOverdue) {
  if (hoursOverdue >= 72) return "ceo";
  if (hoursOverdue >= 48) return "centre_head";
  if (hoursOverdue >= 24) return "coordinator";
  if (hoursOverdue >= 0) return "supervisor";
  return null;
}

async function userChain(userId) {
  const chain = {};
  let current = await User.findById(userId).select("_id role reportsTo").lean();
  const seen = new Set();
  while (current && current.reportsTo && !seen.has(String(current._id))) {
    seen.add(String(current._id));
    const manager = await User.findById(current.reportsTo).select("_id role reportsTo active").lean();
    if (!manager || manager.active === false) break;
    chain[manager.role] = manager;
    current = manager;
  }
  return chain;
}

async function escalateTask(task) {
  const hours = Math.floor((Date.now() - new Date(task.dueDate).getTime()) / HOUR_MS);
  const level = escalationLevelForAge(hours);
  if (!level) return;

  if (task.status !== "overdue") {
    await Task.updateOne({ _id: task._id }, { $set: { status: "overdue" } });
  }

  const assigneeId = task.assignees?.[0];
  if (!assigneeId) return;
  const chain = await userChain(assigneeId);
  const target = chain[level];
  if (!target) return;

  const existing = await Escalation.findOne({ taskId: task._id, level, status: "open" }).lean();
  if (existing) return;

  await Escalation.create({
    taskId: task._id,
    level,
    triggerReason: "overdue",
    status: "open",
    notifiedUsers: [target._id],
  });

  await notifyMany([target._id], {
    type: "task_escalated",
    title: `Escalation: ${task.title}`,
    message: `Task is overdue by ${hours}h and requires ${level.replace("_", " ")} action.`,
    link: "/for-approval",
  });
}

export async function runEscalationSweep() {
  const q = {
    deletedAt: null,
    status: { $in: ["pending", "in_progress", "awaiting_approval", "overdue"] },
    dueDate: { $lt: new Date() },
  };
  const tasks = await Task.find(q).select("_id title dueDate status assignees").lean();
  for (const t of tasks) {
    // eslint-disable-next-line no-await-in-loop
    await escalateTask(t);
  }
  return tasks.length;
}

export function startEscalationScheduler() {
  const intervalMs = Math.max(HOUR_MS, Number(process.env.ESCALATION_SWEEP_INTERVAL_MS) || HOUR_MS);
  void runEscalationSweep().catch((e) => console.error("[escalation] Startup sweep failed:", e));
  setInterval(() => {
    runEscalationSweep().catch((e) => console.error("[escalation] Scheduled sweep failed:", e));
  }, intervalMs);
  console.log(`[escalation] Sweep scheduler started (every ${Math.round(intervalMs / HOUR_MS)}h)`);
}
