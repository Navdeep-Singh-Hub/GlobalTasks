import { Router } from "express";
import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Activity } from "../models/Activity.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

const RECURRING = ["daily", "weekly", "fortnightly", "monthly", "quarterly", "yearly"];

function rangeForScope(scope) {
  const now = new Date();
  if (scope === "all") return {};
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { createdAt: { $gte: from, $lte: to } };
}

router.get("/summary", async (req, res) => {
  const scope = String(req.query.scope || "month");
  const base = { deletedAt: null, ...rangeForScope(scope) };

  const now = new Date();
  const [totalTasks, pending, completed, overdue, activeProjects] = await Promise.all([
    Task.countDocuments(base),
    Task.countDocuments({ ...base, status: "pending" }),
    Task.countDocuments({ ...base, status: "completed" }),
    Task.countDocuments({ ...base, status: { $ne: "completed" }, dueDate: { $lt: now } }),
    Project.countDocuments({ status: "active" }),
  ]);

  const byStatus = await Task.aggregate([
    { $match: base },
    { $group: { _id: "$status", value: { $sum: 1 } } },
  ]);

  const byCadence = await Task.aggregate([
    { $match: base },
    {
      $group: {
        _id: "$taskType",
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
      },
    },
  ]);

  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const monthly = await Task.aggregate([
    { $match: { deletedAt: null, createdAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
        planned: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
      },
    },
    { $sort: { "_id.y": 1, "_id.m": 1 } },
  ]);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const deliveryCurve = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const found = monthly.find((x) => x._id.y === d.getFullYear() && x._id.m === d.getMonth() + 1);
    deliveryCurve.push({
      label: monthNames[d.getMonth()],
      planned: found?.planned || 0,
      completed: found?.completed || 0,
    });
  }

  res.json({
    cards: {
      totalTasks,
      pending,
      completed,
      overdue,
      activeProjects,
      overduePct: totalTasks ? Math.round((overdue / totalTasks) * 1000) / 10 : 0,
    },
    byStatus: byStatus.map((x) => ({ name: x._id, value: x.value })),
    byCadence,
    deliveryCurve,
  });
});

router.get("/team-performance", async (_req, res) => {
  const users = await User.find({ active: true }).select("_id name email role avatarUrl title").lean();
  const results = await Promise.all(
    users.map(async (u) => {
      const [total, pending, overdue, completed] = await Promise.all([
        Task.countDocuments({ assignees: u._id, deletedAt: null }),
        Task.countDocuments({ assignees: u._id, deletedAt: null, status: "pending" }),
        Task.countDocuments({ assignees: u._id, deletedAt: null, status: { $ne: "completed" }, dueDate: { $lt: new Date() } }),
        Task.countDocuments({ assignees: u._id, deletedAt: null, status: "completed" }),
      ]);
      const oneTime = await Task.countDocuments({ assignees: u._id, deletedAt: null, taskType: "one_time" });
      const daily = await Task.countDocuments({ assignees: u._id, deletedAt: null, taskType: "daily" });
      const recurring = await Task.countDocuments({ assignees: u._id, deletedAt: null, taskType: { $in: RECURRING } });
      const completion = total ? Math.round((completed / total) * 1000) / 10 : 0;
      return { user: u, total, pending, overdue, completed, completion, oneTime, daily, recurring };
    })
  );
  res.json({ members: results });
});

router.get("/activity", async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 10);
  const items = await Activity.find().sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ items });
});

router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ tasks: [], projects: [], users: [] });
  const [tasks, projects, users] = await Promise.all([
    Task.find({ title: new RegExp(q, "i"), deletedAt: null }).limit(8).lean(),
    Project.find({ name: new RegExp(q, "i") }).limit(8).lean(),
    User.find({ $or: [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }] }).limit(8).lean(),
  ]);
  res.json({ tasks, projects, users });
});

export default router;
