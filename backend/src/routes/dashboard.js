import { Router } from "express";
import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Activity } from "../models/Activity.js";
import { Escalation } from "../models/Escalation.js";
import { authRequired, requireCenterAssigned } from "../middleware/auth.js";
import { isCeo } from "../constants/roles.js";

const router = Router();
router.use(authRequired);
router.use(requireCenterAssigned);

async function actor(req) {
  if (req._actor) return req._actor;
  req._actor = await User.findById(req.userId).select("_id role centerId").lean();
  return req._actor;
}

const RECURRING = ["daily", "weekly", "fortnightly", "monthly", "quarterly", "yearly"];

function rangeForScope(scope) {
  const now = new Date();
  if (scope === "all") return {};
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { createdAt: { $gte: from, $lte: to } };
}

router.get("/summary", async (req, res) => {
  const me = await actor(req);
  const scope = String(req.query.scope || "month");
  const base = { deletedAt: null, ...rangeForScope(scope) };
  if (req.query.centerId) base.centerId = req.query.centerId;
  if (req.query.departmentId) base.departmentId = req.query.departmentId;
  if (!isCeo(req.userRole)) base.centerId = me?.centerId || null;
  const projectFilter = isCeo(req.userRole)
    ? { status: "active" }
    : { status: "active", owner: { $in: await User.find({ centerId: me?.centerId || null }).distinct("_id") } };

  const now = new Date();
  const [totalTasks, pending, completed, overdue, activeProjects] = await Promise.all([
    Task.countDocuments(base),
    Task.countDocuments({ ...base, status: "pending" }),
    Task.countDocuments({ ...base, status: "completed" }),
    Task.countDocuments({ ...base, status: { $ne: "completed" }, dueDate: { $lt: now } }),
    Project.countDocuments(projectFilter),
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
  const monthlyMatch = { deletedAt: null, createdAt: { $gte: sixMonthsAgo } };
  if (!isCeo(req.userRole)) monthlyMatch.centerId = me?.centerId || null;
  const monthly = await Task.aggregate([
    { $match: monthlyMatch },
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
  const me = await actor(_req);
  const userFilter = { active: true };
  if (!isCeo(_req.userRole)) userFilter.centerId = me?.centerId || null;
  const users = await User.find(userFilter).select("_id name email role executorKind avatarUrl title").lean();
  const results = await Promise.all(
    users.map(async (u) => {
      const [total, pending, overdue, completed] = await Promise.all([
        Task.countDocuments({ assignees: u._id, deletedAt: null, ...(isCeo(_req.userRole) ? {} : { centerId: me?.centerId || null }) }),
        Task.countDocuments({ assignees: u._id, deletedAt: null, status: "pending", ...(isCeo(_req.userRole) ? {} : { centerId: me?.centerId || null }) }),
        Task.countDocuments({
          assignees: u._id,
          deletedAt: null,
          status: { $ne: "completed" },
          dueDate: { $lt: new Date() },
          ...(isCeo(_req.userRole) ? {} : { centerId: me?.centerId || null }),
        }),
        Task.countDocuments({ assignees: u._id, deletedAt: null, status: "completed", ...(isCeo(_req.userRole) ? {} : { centerId: me?.centerId || null }) }),
      ]);
      const oneTime = await Task.countDocuments({ assignees: u._id, deletedAt: null, taskType: "one_time", ...(isCeo(_req.userRole) ? {} : { centerId: me?.centerId || null }) });
      const daily = await Task.countDocuments({ assignees: u._id, deletedAt: null, taskType: "daily", ...(isCeo(_req.userRole) ? {} : { centerId: me?.centerId || null }) });
      const recurring = await Task.countDocuments({
        assignees: u._id,
        deletedAt: null,
        taskType: { $in: RECURRING },
        ...(isCeo(_req.userRole) ? {} : { centerId: me?.centerId || null }),
      });
      const completion = total ? Math.round((completed / total) * 1000) / 10 : 0;
      return { user: u, total, pending, overdue, completed, completion, oneTime, daily, recurring };
    })
  );
  res.json({ members: results });
});

router.get("/activity", async (req, res) => {
  const me = await actor(req);
  const limit = Math.min(50, Number(req.query.limit) || 10);
  let items = [];
  if (isCeo(req.userRole)) {
    items = await Activity.find().sort({ createdAt: -1 }).limit(limit).lean();
  } else {
    const taskIds = await Task.find({ centerId: me?.centerId || null }).select("_id").limit(2000).lean();
    items = await Activity.find({ task: { $in: taskIds.map((t) => t._id) } }).sort({ createdAt: -1 }).limit(limit).lean();
  }
  res.json({ items });
});

router.get("/escalations", async (req, res) => {
  const me = await actor(req);
  const status = req.query.status ? String(req.query.status) : "open";
  const q = {};
  if (status !== "all") q.status = status;
  let items = await Escalation.find(q)
    .populate("taskId", "title status dueDate centerId departmentId")
    .populate("notifiedUsers", "name role")
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Number(req.query.limit) || 50))
    .lean();
  if (!isCeo(req.userRole)) {
    items = items.filter((i) => String(i.taskId?.centerId || "") === String(me?.centerId || ""));
  }
  res.json({ items });
});

router.get("/search", async (req, res) => {
  const me = await actor(req);
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ tasks: [], projects: [], users: [] });
  const centerScope = !isCeo(req.userRole) ? { centerId: me?.centerId || null } : {};
  const [tasks, projects, users] = await Promise.all([
    Task.find({ title: new RegExp(q, "i"), deletedAt: null, ...centerScope }).limit(8).lean(),
    Project.find({ name: new RegExp(q, "i") }).limit(8).lean(),
    User.find({ $or: [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }], ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }) })
      .limit(8)
      .lean(),
  ]);
  res.json({ tasks, projects, users });
});

export default router;
