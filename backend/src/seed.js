import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "./config/database.js";
import { User } from "./models/User.js";
import { Project } from "./models/Project.js";
import { Task } from "./models/Task.js";
import { Notification } from "./models/Notification.js";
import { Activity } from "./models/Activity.js";
import { Center } from "./models/Center.js";
import { Department } from "./models/Department.js";

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
    Center.deleteMany({}),
    Department.deleteMany({}),
  ]);

  const centers = await Center.insertMany([
    { name: "Ludhiana", code: "LDH" },
    { name: "Moga", code: "MOG" },
    { name: "Jalandhar", code: "JAL" },
    { name: "Faridkot", code: "FDK" },
    { name: "Malerkotla", code: "MLK" },
    { name: "Amritsar", code: "ASR" },
    { name: "Patiala", code: "PTA" },
    { name: "Bathinda", code: "BTD" },
    { name: "Mohali", code: "MHL" },
  ]);
  const [cLudhiana] = centers;
  const departments = await Department.insertMany([
    { name: "Marketing", code: "MKT" },
    { name: "Reception", code: "REC" },
    { name: "Operations", code: "OPS" },
    { name: "Clinical", code: "CLN" },
    { name: "Admin", code: "ADM" },
    { name: "Management", code: "MGT" },
  ]);
  const deptByCode = Object.fromEntries(departments.map((d) => [d.code, d]));

  const passwordHash = await bcrypt.hash("demo123", 10);
  const [ceoUser, centreHead, coordinatorUser, supervisorUser, executorUser] = await User.insertMany([
    {
      name: "Ravish Arora",
      email: "admin@globaltasks.demo",
      phone: "+91 81814 60771",
      role: "ceo",
      executorKind: "",
      department: "",
      departmentPrimary: deptByCode.MGT._id,
      centerId: cLudhiana._id,
      permissions: ["view_tasks", "assign_tasks", "manage_users", "approve_tasks", "view_all_team_tasks"],
      title: "CEO",
      passwordHash,
      active: true,
      lastAccessAt: new Date(),
    },
    {
      name: "Sandeep Singh",
      email: "manager@globaltasks.demo",
      phone: "+91 70877 34211",
      role: "centre_head",
      executorKind: "",
      department: "operations",
      departmentPrimary: deptByCode.OPS._id,
      centerId: cLudhiana._id,
      permissions: ["view_tasks", "view_all_team_tasks", "assign_tasks", "manage_users"],
      title: "Centre Head",
      passwordHash,
      active: true,
    },
    {
      name: "Priya Sharma",
      email: "coordinator@globaltasks.demo",
      phone: "+91 70000 00001",
      role: "coordinator",
      executorKind: "",
      department: "clinical",
      departmentPrimary: deptByCode.CLN._id,
      centerId: cLudhiana._id,
      permissions: ["view_tasks", "view_all_team_tasks", "assign_tasks"],
      title: "Coordinator",
      passwordHash,
      active: true,
    },
    {
      name: "Amit Verma",
      email: "supervisor@globaltasks.demo",
      phone: "+91 70000 00002",
      role: "supervisor",
      executorKind: "",
      department: "clinical",
      departmentPrimary: deptByCode.CLN._id,
      centerId: cLudhiana._id,
      permissions: ["view_tasks", "view_all_team_tasks", "assign_tasks"],
      title: "Supervisor",
      passwordHash,
      active: true,
    },
    {
      name: "Jatinder Dubey",
      email: "user@globaltasks.demo",
      phone: "+91 87987 23324",
      role: "executor",
      executorKind: "marketing",
      department: "marketing",
      departmentPrimary: deptByCode.MKT._id,
      centerId: cLudhiana._id,
      permissions: ["view_tasks", "assign_tasks"],
      title: "Marketing Executive",
      passwordHash,
      active: true,
    },
  ]);
  centreHead.reportsTo = ceoUser._id;
  coordinatorUser.reportsTo = centreHead._id;
  supervisorUser.reportsTo = coordinatorUser._id;
  executorUser.reportsTo = supervisorUser._id;
  await Promise.all([centreHead.save(), coordinatorUser.save(), supervisorUser.save(), executorUser.save()]);

  const [pMarketing, pOps] = await Project.insertMany([
    {
      name: "Marketing Operations",
      description: "Daily marketing, content and campaign execution",
      startDate: new Date(),
      endDate: plusDays(90),
      status: "active",
      owner: centreHead._id,
    },
    {
      name: "Centre Performance",
      description: "Weekly centre-level audits and reviews",
      startDate: new Date(),
      endDate: plusDays(60),
      status: "active",
      owner: ceoUser._id,
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
      departmentId: deptByCode.MKT._id,
      centerId: cLudhiana._id,
      functionTag: "daily_followup",
      requiredInputsSchema: { type: "object", properties: { outcome: { type: "string" } }, required: ["outcome"] },
      recurrence: { forever: true, includeSunday: false, weekOff: "Sunday" },
      project: pMarketing._id,
      assignees: [centreHead._id],
      createdBy: ceoUser._id,
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
      departmentId: deptByCode.OPS._id,
      centerId: cLudhiana._id,
      functionTag: "weekly_review",
      requiredInputsSchema: { type: "object", properties: { notes: { type: "string" } }, required: ["notes"] },
      recurrence: { forever: true, includeSunday: false, weekOff: "Sunday" },
      project: pOps._id,
      assignees: [centreHead._id],
      createdBy: ceoUser._id,
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
      departmentId: deptByCode.OPS._id,
      centerId: cLudhiana._id,
      functionTag: "monthly_audit",
      requiredInputsSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
      recurrence: { forever: true, includeSunday: false, weekOff: "Sunday" },
      project: pOps._id,
      assignees: [centreHead._id],
      createdBy: ceoUser._id,
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
    departmentId: deptByCode.ADM._id,
    centerId: cLudhiana._id,
    functionTag: "compliance_submission",
    requiredInputsSchema: { type: "object", properties: { fileRef: { type: "string" } }, required: ["fileRef"] },
    project: pOps._id,
    assignees: [centreHead._id],
    createdBy: ceoUser._id,
  });

  // 1 fortnight meeting (high)
  tasks.push({
    title: "fortnight meeting with digital team",
    description: "Bi-weekly sync with digital agency partners.",
    taskType: "fortnightly",
    status: "pending",
    priority: "high",
    dueDate: plusDays(1),
    departmentId: deptByCode.MKT._id,
    centerId: cLudhiana._id,
    functionTag: "fortnight_sync",
    requiredInputsSchema: { type: "object", properties: { attendees: { type: "string" } }, required: ["attendees"] },
    recurrence: { forever: true, includeSunday: false, weekOff: "Sunday" },
    project: pMarketing._id,
    assignees: [centreHead._id],
    createdBy: ceoUser._id,
  });

  const created = await Task.insertMany(tasks);
  const ids = created.map((t, i) => ({ ...t.toObject(), displayId: 1200 + i }));
  void ids;
  const weeklyTask = created.find((t) => t.taskType === "weekly");
  const activities = [];
  for (let i = 0; i < 10; i++) {
    activities.push({
      actor: ceoUser._id,
      actorName: ceoUser.name,
      type: "task_assigned",
      message: `${centreHead.name} was assigned ${weeklyTask.title}`,
      task: weeklyTask._id,
      taskTitle: weeklyTask.title,
      taskType: "weekly",
      createdAt: minusDays(i * 0.5),
    });
  }
  await Activity.insertMany(activities);

  await Notification.insertMany([
    {
      user: centreHead._id,
      type: "task_assigned",
      title: "Task assigned",
      message: "fortnight meeting with digital team",
      link: "/pending-recurring",
    },
    {
      user: centreHead._id,
      type: "task_assigned",
      title: "Task assigned",
      message: "Nikhil daily work checking",
      link: "/pending-recurring",
    },
  ]);

  console.log("\n✅ Seed complete\n");
  console.log("Demo accounts (password: demo123):");
  console.log("  admin@globaltasks.demo        - CEO (Ravish Arora)");
  console.log("  manager@globaltasks.demo      - Centre Head (Sandeep Singh)");
  console.log("  coordinator@globaltasks.demo  - Coordinator (Priya Sharma)");
  console.log("  supervisor@globaltasks.demo   - Supervisor (Amit Verma)");
  console.log("  user@globaltasks.demo         - Executor / Marketing (Jatinder Dubey)");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
