import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "./config/database.js";
import { User } from "./models/User.js";
import { Project } from "./models/Project.js";
import { Task } from "./models/Task.js";
import { Notification } from "./models/Notification.js";
import { Activity } from "./models/Activity.js";

function plusDays(d) {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
}
function minusDays(d) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}

async function run() {
  await connectDatabase(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/globaltasks");
  await Promise.all([
    User.deleteMany({}),
    Project.deleteMany({}),
    Task.deleteMany({}),
    Notification.deleteMany({}),
    Activity.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash("demo123", 10);
  const [admin, manager, user1] = await User.insertMany([
    {
      name: "Ravish Arora",
      email: "admin@globaltasks.demo",
      phone: "+91 81814 60771",
      role: "admin",
      department: "",
      permissions: ["view_tasks", "assign_tasks", "manage_users", "approve_tasks", "view_all_team_tasks"],
      title: "Admin",
      passwordHash,
      active: true,
      lastAccessAt: new Date(),
    },
    {
      name: "sandeep singh",
      email: "manager@globaltasks.demo",
      phone: "+91 70877 34211",
      role: "manager",
      department: "marketing",
      permissions: ["view_tasks", "view_all_team_tasks", "assign_tasks"],
      title: "Marketing Manager",
      passwordHash,
      active: true,
    },
    {
      name: "jatinder dubey",
      email: "user@globaltasks.demo",
      phone: "+91 87987 23324",
      role: "user",
      department: "marketing",
      permissions: ["view_tasks", "assign_tasks"],
      title: "Marketing Executive",
      passwordHash,
      active: true,
    },
  ]);

  const [pMarketing, pOps] = await Project.insertMany([
    {
      name: "Marketing Operations",
      description: "Daily marketing, content and campaign execution",
      startDate: new Date(),
      endDate: plusDays(90),
      status: "active",
      owner: manager._id,
    },
    {
      name: "Centre Performance",
      description: "Weekly centre-level audits and reviews",
      startDate: new Date(),
      endDate: plusDays(60),
      status: "active",
      owner: admin._id,
    },
  ]);

  const RECURRING_TITLES = {
    daily: [
      "Nikhil daily work checking",
      "confirm new & follow up clients",
      "daily centre check-in summary",
      "morning marketing standup",
      "collect daily lead report",
    ],
    weekly: ["review performance of all centres (leads,visits,admission)", "weekly content calendar review"],
    fortnightly: ["fortnight meeting with digital team"],
    monthly: ["monthly admission reconciliation", "monthly creative assets audit"],
    quarterly: [],
    yearly: [],
  };

  const tasks = [];

  let taskId = 1200;

  // 60 daily tasks
  for (let i = 0; i < 60; i++) {
    const title = RECURRING_TITLES.daily[i % RECURRING_TITLES.daily.length];
    tasks.push({
      title,
      description: "Daily recurring responsibility tracked by admin.",
      taskType: "daily",
      status: "pending",
      priority: i % 7 === 0 ? "high" : "normal",
      dueDate: plusDays(0),
      recurrence: { forever: true, includeSunday: false, weekOff: "Sunday" },
      project: pMarketing._id,
      assignees: [manager._id],
      createdBy: admin._id,
      tags: ["recurring"],
    });
  }

  // 12 weekly tasks
  for (let i = 0; i < 12; i++) {
    tasks.push({
      title: RECURRING_TITLES.weekly[i % RECURRING_TITLES.weekly.length],
      description: "Weekly review ritual.",
      taskType: "weekly",
      status: "pending",
      priority: i % 3 === 0 ? "high" : "normal",
      dueDate: plusDays(i),
      recurrence: { forever: true, includeSunday: false, weekOff: "Sunday" },
      project: pOps._id,
      assignees: [manager._id],
      createdBy: admin._id,
    });
  }

  // 3 monthly
  for (let i = 0; i < 3; i++) {
    tasks.push({
      title: RECURRING_TITLES.monthly[i % RECURRING_TITLES.monthly.length],
      description: "Monthly cadence item.",
      taskType: "monthly",
      status: "pending",
      priority: "normal",
      dueDate: plusDays(10 + i),
      recurrence: { forever: true, includeSunday: false, weekOff: "Sunday" },
      project: pOps._id,
      assignees: [manager._id],
      createdBy: admin._id,
    });
  }

  // 1 overdue
  tasks.push({
    title: "submit compliance pack",
    description: "Quarterly compliance file - overdue item.",
    taskType: "quarterly",
    status: "pending",
    priority: "urgent",
    dueDate: minusDays(2),
    project: pOps._id,
    assignees: [manager._id],
    createdBy: admin._id,
  });

  // 1 fortnight meeting (high)
  tasks.push({
    title: "fortnight meeting with digital team",
    description: "Bi-weekly sync with digital agency partners.",
    taskType: "fortnightly",
    status: "pending",
    priority: "high",
    dueDate: plusDays(1),
    recurrence: { forever: true, includeSunday: false, weekOff: "Sunday" },
    project: pMarketing._id,
    assignees: [manager._id],
    createdBy: admin._id,
  });

  const created = await Task.insertMany(tasks);
  const ids = created.map((t, i) => ({ ...t.toObject(), displayId: 1200 + i }));
  void ids;
  taskId += tasks.length;

  const weeklyTask = created.find((t) => t.taskType === "weekly");
  const activities = [];
  for (let i = 0; i < 10; i++) {
    activities.push({
      actor: admin._id,
      actorName: admin.name,
      type: "task_assigned",
      message: `${manager.name} was assigned ${weeklyTask.title}`,
      task: weeklyTask._id,
      taskTitle: weeklyTask.title,
      taskType: "weekly",
      createdAt: minusDays(i * 0.5),
    });
  }
  await Activity.insertMany(activities);

  await Notification.insertMany([
    {
      user: manager._id,
      type: "task_assigned",
      title: "Task assigned",
      message: "fortnight meeting with digital team",
      link: "/pending-recurring",
    },
    {
      user: manager._id,
      type: "task_assigned",
      title: "Task assigned",
      message: "Nikhil daily work checking",
      link: "/pending-recurring",
    },
  ]);

  console.log("\n✅ Seed complete\n");
  console.log("Demo accounts (password: demo123):");
  console.log("  admin@globaltasks.demo      - Admin (Ravish Arora)");
  console.log("  manager@globaltasks.demo    - Manager (sandeep singh)");
  console.log("  user@globaltasks.demo       - User (jatinder dubey)");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
