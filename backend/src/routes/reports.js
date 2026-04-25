import { Router } from "express";
import PDFDocument from "pdfkit";
import { Task } from "../models/Task.js";
import { DailyReport } from "../models/DailyReport.js";
import { User } from "../models/User.js";
import { TherapistSession } from "../models/TherapistSession.js";
import { authRequired, requireCenterAssigned } from "../middleware/auth.js";
import { isCeo, isManagement } from "../constants/roles.js";
import { getDescendantUsers } from "../services/hierarchy.js";
import { isWeekOffOnDate } from "../utils/weekoff.js";

const router = Router();
router.use(authRequired);
router.use(requireCenterAssigned);

const PERF_CACHE_TTL_MS = 30_000;
const perfCache = new Map();

async function actor(req) {
  if (req._actor) return req._actor;
  req._actor = await User.findById(req.userId).select("_id role centerId").lean();
  return req._actor;
}

function parsePageLimit(query, defaultLimit = 25, maxLimit = 100) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function perfCacheKey(req, me) {
  return JSON.stringify({
    role: req.userRole,
    uid: String(req.userId || ""),
    center: String(me?.centerId || ""),
    from: String(req.query.from || ""),
    to: String(req.query.to || ""),
    therapistId: String(req.query.therapistId || ""),
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 25,
  });
}

function getCachedPerf(key) {
  const row = perfCache.get(key);
  if (!row) return null;
  if (Date.now() - row.ts > PERF_CACHE_TTL_MS) {
    perfCache.delete(key);
    return null;
  }
  return row.value;
}

function setCachedPerf(key, value) {
  perfCache.set(key, { ts: Date.now(), value });
}

router.get("/summary", async (req, res) => {
  const me = await actor(req);
  const { from, to } = req.query;
  const filter = { deletedAt: null };
  if (from || to) {
    filter.updatedAt = {};
    if (from) filter.updatedAt.$gte = new Date(from);
    if (to) filter.updatedAt.$lte = new Date(to);
  }
  if (!isCeo(req.userRole)) filter.centerId = me?.centerId || null;
  const weekly = await Task.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%U", date: "$updatedAt" } },
        done: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  res.json({ weeklyCompleted: weekly.map((w) => ({ week: w._id, done: w.done })) });
});

router.post("/daily", async (req, res) => {
  const me = await actor(req);
  const reportDate = String(req.body.reportDate || new Date().toISOString().slice(0, 10));
  const payload = {
    userId: req.userId,
    centerId: me?.centerId || null,
    reportDate,
    departmentsWorked: Array.isArray(req.body.departmentsWorked) ? req.body.departmentsWorked : [],
    completedTaskIds: Array.isArray(req.body.completedTaskIds) ? req.body.completedTaskIds : [],
    pendingTaskIds: Array.isArray(req.body.pendingTaskIds) ? req.body.pendingTaskIds : [],
    issues: Array.isArray(req.body.issues) ? req.body.issues : [],
    completionPercent: Number(req.body.completionPercent) || 0,
    source: req.body.source === "whatsapp_link" ? "whatsapp_link" : "app",
    submittedAt: new Date(),
  };
  const report = await DailyReport.findOneAndUpdate(
    { userId: req.userId, reportDate },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.status(201).json({ report });
});

router.get("/daily", async (req, res) => {
  const me = await actor(req);
  const q = {};
  if (req.query.userId) q.userId = req.query.userId;
  if (req.query.from || req.query.to) {
    q.reportDate = {};
    if (req.query.from) q.reportDate.$gte = String(req.query.from);
    if (req.query.to) q.reportDate.$lte = String(req.query.to);
  }
  if (!isCeo(req.userRole)) q.centerId = me?.centerId || null;
  const reports = await DailyReport.find(q)
    .populate("userId", "name email role")
    .populate("departmentsWorked", "name code")
    .sort({ reportDate: -1, createdAt: -1 })
    .limit(Math.min(500, Number(req.query.limit) || 100))
    .lean();
  res.json({ reports });
});

router.get("/individual", async (req, res) => {
  const me = await actor(req);
  const userId = req.query.userId || req.userId;
  const base = { assignees: userId, deletedAt: null, ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }) };
  const [completed, pending, overdue, total] = await Promise.all([
    Task.countDocuments({ ...base, status: "completed" }),
    Task.countDocuments({ ...base, status: { $in: ["pending", "in_progress", "awaiting_approval"] } }),
    Task.countDocuments({ ...base, status: "overdue" }),
    Task.countDocuments(base),
  ]);
  const completionPercent = total ? Math.round((completed / total) * 1000) / 10 : 0;
  res.json({ userId, completed, pending, overdue, total, completionPercent });
});

router.get("/supervisor", async (req, res) => {
  const me = await actor(req);
  const supervisorId = req.query.supervisorId || req.userId;
  const team = await User.find({
    reportsTo: supervisorId,
    active: true,
    ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }),
  })
    .select("_id name role")
    .lean();
  const ids = team.map((u) => u._id);
  const [total, completed, pending, overdue] = await Promise.all([
    Task.countDocuments({ assignees: { $in: ids }, deletedAt: null, ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }) }),
    Task.countDocuments({
      assignees: { $in: ids },
      deletedAt: null,
      status: "completed",
      ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }),
    }),
    Task.countDocuments({
      assignees: { $in: ids },
      deletedAt: null,
      status: { $in: ["pending", "in_progress", "awaiting_approval"] },
      ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }),
    }),
    Task.countDocuments({ assignees: { $in: ids }, deletedAt: null, status: "overdue", ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }) }),
  ]);
  res.json({ supervisorId, teamCount: team.length, total, completed, pending, overdue, team });
});

router.get("/coordinator", async (req, res) => {
  const me = await actor(req);
  const coordinatorId = req.query.coordinatorId || req.userId;
  const supervisors = await User.find({
    role: "supervisor",
    active: true,
    ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }),
  })
    .select("_id name role")
    .lean();
  const executors = await User.find({
    role: "executor",
    active: true,
    ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }),
  })
    .select("_id")
    .lean();
  const executorIds = executors.map((u) => u._id);
  const byDepartment = await Task.aggregate([
    { $match: { assignees: { $in: executorIds }, deletedAt: null, ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }) } },
    {
      $group: {
        _id: "$departmentId",
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
      },
    },
  ]);
  res.json({ coordinatorId, supervisors: supervisors.length, executors: executors.length, byDepartment });
});

router.get("/centre-head", async (req, res) => {
  const me = await actor(req);
  const centreHeadId = req.query.centreHeadId || req.userId;
  const centerUsers = await User.find({
    reportsTo: centreHeadId,
    active: true,
    ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }),
  })
    .select("_id")
    .lean();
  const childIds = centerUsers.map((u) => u._id);
  const summary = await Task.aggregate([
    { $match: { assignees: { $in: childIds }, deletedAt: null, ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }) } },
    {
      $group: {
        _id: "$centerId",
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $in: ["$status", ["pending", "in_progress", "awaiting_approval"]] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
      },
    },
  ]);
  res.json({ centreHeadId, summary });
});

router.get("/ceo-summary", async (req, res) => {
  if (!isCeo(req.userRole)) return res.status(403).json({ message: "CEO access required" });
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const base = { deletedAt: null };
  if (from || to) {
    base.createdAt = {};
    if (from) base.createdAt.$gte = from;
    if (to) base.createdAt.$lte = to;
  }
  const [totals, byCenter, byDepartment, nonReporting] = await Promise.all([
    Task.aggregate([
      { $match: base },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ["$status", ["pending", "in_progress", "awaiting_approval"]] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } },
        },
      },
    ]),
    Task.aggregate([{ $match: base }, { $group: { _id: "$centerId", total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } } } }]),
    Task.aggregate([{ $match: base }, { $group: { _id: "$departmentId", total: { $sum: 1 }, overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } } } }]),
    User.find({ active: true, role: "executor", lastAccessAt: null }).select("_id name email role").lean(),
  ]);
  res.json({ totals: totals[0] || { total: 0, completed: 0, pending: 0, overdue: 0 }, byCenter, byDepartment, nonReporting });
});

router.get("/export", async (req, res) => {
  const me = await actor(req);
  const format = req.query.format || "csv";
  const tasks = await Task.find({ deletedAt: null, ...(isCeo(req.userRole) ? {} : { centerId: me?.centerId || null }) })
    .populate("project", "name")
    .populate("assignees", "name")
    .sort({ updatedAt: -1 })
    .lean();

  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=tasks-report.pdf");
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(16).text("Tasks Report");
    doc.moveDown();
    tasks.forEach((t, i) => {
      const names = (t.assignees || []).map((a) => a.name).join(", ");
      doc.fontSize(10).text(`${i + 1}. ${t.title} | ${t.status} | ${t.priority} | ${t.taskType} | ${names}`);
    });
    doc.end();
    return;
  }

  const rows = tasks.map((t) =>
    [
      t.title,
      t.taskType,
      t.status,
      t.priority,
      new Date(t.dueDate).toISOString().slice(0, 10),
      (t.assignees || []).map((a) => a.name).join("; "),
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",")
  );
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=tasks-report.csv");
  res.send(["title,taskType,status,priority,dueDate,assignees", ...rows].join("\n"));
});

router.post("/therapist-sessions", async (req, res) => {
  const me = await actor(req);
  const meUser = await User.findById(req.userId).select("_id role executorKind centerId departmentPrimary weekOffDays").lean();
  const isTherapist = meUser?.role === "executor" && meUser?.executorKind === "therapist";
  if (!isTherapist && !isManagement(req.userRole)) {
    return res.status(403).json({ message: "Only therapists or management can submit sessions" });
  }

  const therapistId = isTherapist ? req.userId : String(req.body.therapistId || "");
  if (!therapistId) return res.status(400).json({ message: "Therapist is required" });

  const therapist = await User.findById(therapistId).select("_id role executorKind centerId departmentPrimary weekOffDays").lean();
  if (!therapist || therapist.role !== "executor" || therapist.executorKind !== "therapist") {
    return res.status(400).json({ message: "Selected user is not a therapist" });
  }
  if (!isCeo(req.userRole) && String(therapist.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "Therapist must belong to your center" });
  }

  const sessionDate = String(req.body.sessionDate || new Date().toISOString().slice(0, 10));
  if (isWeekOffOnDate(therapist.weekOffDays || [], sessionDate)) {
    return res.status(400).json({ message: "Session cannot be uploaded on therapist week off day." });
  }
  const patientName = String(req.body.patientName || "").trim();
  if (!patientName) return res.status(400).json({ message: "Patient name is required" });
  const durationMinutes =
    Number(req.body.durationMinutes) > 0
      ? Number(req.body.durationMinutes)
      : Number(req.body.startedAt && req.body.endedAt ? 30 : 0);

  const session = await TherapistSession.create({
    therapistId: therapist._id,
    centerId: therapist.centerId,
    departmentId: therapist.departmentPrimary || null,
    sessionDate,
    patientName,
    patientCode: String(req.body.patientCode || ""),
    startedAt: String(req.body.startedAt || ""),
    endedAt: String(req.body.endedAt || ""),
    durationMinutes,
    videoUrl: String(req.body.videoUrl || ""),
    videoUploaded:
      typeof req.body.videoUploaded === "boolean"
        ? req.body.videoUploaded
        : Boolean(String(req.body.videoUrl || "").trim()),
    attendanceMarked: req.body.attendanceMarked !== false,
    planUpdated15d: !!req.body.planUpdated15d,
    newActivity15d: !!req.body.newActivity15d,
    newActivityText: String(req.body.newActivityText || ""),
    monthlyTestDone: !!req.body.monthlyTestDone,
    monthlyTestNotes: String(req.body.monthlyTestNotes || ""),
    createdBy: req.userId,
  });

  const populated = await TherapistSession.findById(session._id)
    .populate("therapistId", "name email role executorKind")
    .populate("centerId", "name code")
    .populate("markedBy", "name role")
    .lean();
  res.status(201).json({ session: populated });
});

router.get("/therapist-sessions", async (req, res) => {
  const me = await actor(req);
  if (!isManagement(req.userRole)) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }
  const { page, limit, skip } = parsePageLimit(req.query, 30, 100);

  const q = {};
  if (req.query.from || req.query.to) {
    q.sessionDate = {};
    if (req.query.from) q.sessionDate.$gte = String(req.query.from);
    if (req.query.to) q.sessionDate.$lte = String(req.query.to);
  }
  if (req.query.therapistId) q.therapistId = req.query.therapistId;
  if (!isCeo(req.userRole)) q.centerId = me?.centerId || null;
  if (req.userRole === "supervisor") {
    const descendants = await getDescendantUsers(req.userId, me?.centerId || null);
    const therapistIds = descendants
      .filter((u) => u.role === "executor" && u.executorKind === "therapist")
      .map((u) => u._id);
    if (!therapistIds.length) q.therapistId = null;
    else if (q.therapistId) {
      q.therapistId = therapistIds.find((id) => String(id) === String(q.therapistId)) || null;
    } else {
      q.therapistId = { $in: therapistIds };
    }
  }

  const [sessions, total] = await Promise.all([
    TherapistSession.find(q)
      .populate("therapistId", "name email role executorKind")
      .populate("centerId", "name code")
      .populate("markedBy", "name role")
      .sort({ sessionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TherapistSession.countDocuments(q),
  ]);
  res.json({ sessions, total, page, limit });
});

router.patch("/therapist-sessions/:id/marks", async (req, res) => {
  const me = await actor(req);
  if (req.userRole !== "supervisor") return res.status(403).json({ message: "Only supervisors can rate therapists" });

  const session = await TherapistSession.findById(req.params.id);
  if (!session) return res.status(404).json({ message: "Session not found" });
  if (!isCeo(req.userRole) && String(session.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can rate sessions from your center only" });
  }

  const score = Math.max(0, Math.min(5, Number(req.body.supervisorScore) || 0));
  session.supervisorScore = score;
  session.supervisorRemarks = String(req.body.supervisorRemarks || "").trim();
  session.markedBy = req.userId;
  session.markedAt = new Date();
  await session.save();

  const populated = await TherapistSession.findById(session._id)
    .populate("therapistId", "name email role executorKind")
    .populate("centerId", "name code")
    .populate("markedBy", "name role")
    .lean();
  res.json({ session: populated });
});

router.get("/therapist-performance", async (req, res) => {
  const me = await actor(req);
  if (!isManagement(req.userRole)) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }
  const { page, limit, skip } = parsePageLimit(req.query, 25, 100);
  const cacheKey = perfCacheKey(req, me);
  const cached = getCachedPerf(cacheKey);
  if (cached) return res.json(cached);
  const q = {};
  if (req.query.from || req.query.to) {
    q.sessionDate = {};
    if (req.query.from) q.sessionDate.$gte = String(req.query.from);
    if (req.query.to) q.sessionDate.$lte = String(req.query.to);
  }
  if (req.query.therapistId) q.therapistId = req.query.therapistId;
  if (!isCeo(req.userRole)) q.centerId = me?.centerId || null;
  if (req.userRole === "supervisor") {
    const descendants = await getDescendantUsers(req.userId, me?.centerId || null);
    const therapistIds = descendants
      .filter((u) => u.role === "executor" && u.executorKind === "therapist")
      .map((u) => u._id);
    if (!therapistIds.length) q.therapistId = null;
    else if (q.therapistId) {
      q.therapistId = therapistIds.find((id) => String(id) === String(q.therapistId)) || null;
    } else {
      q.therapistId = { $in: therapistIds };
    }
  }

  const summary = await TherapistSession.aggregate([
    { $match: q },
    {
      $group: {
        _id: "$therapistId",
        sessions: { $sum: 1 },
        patientsCovered: { $addToSet: "$patientName" },
        attendanceDays: { $addToSet: "$sessionDate" },
        planUpdates15d: { $sum: { $cond: [{ $eq: ["$planUpdated15d", true] }, 1, 0] } },
        newActivities15d: { $sum: { $cond: [{ $eq: ["$newActivity15d", true] }, 1, 0] } },
        monthlyTests: { $sum: { $cond: [{ $eq: ["$monthlyTestDone", true] }, 1, 0] } },
        avgSupervisorScore: { $avg: "$supervisorScore" },
      },
    },
    {
      $project: {
        sessions: 1,
        patientsCovered: { $size: "$patientsCovered" },
        attendanceDays: { $size: "$attendanceDays" },
        planUpdates15d: 1,
        newActivities15d: 1,
        monthlyTests: 1,
        avgSupervisorScore: { $round: ["$avgSupervisorScore", 2] },
      },
    },
  ]);

  const therapistIds = summary.map((x) => x._id);
  const users = await User.find({ _id: { $in: therapistIds } }).select("_id name email centerId role executorKind").populate("centerId", "name code").lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  const rows = summary
    .map((s) => ({ therapist: byId.get(String(s._id)) || null, ...s }))
    .filter((row) => !!row.therapist)
    .sort((a, b) => b.sessions - a.sessions || b.avgSupervisorScore - a.avgSupervisorScore);
  const total = rows.length;
  const pagedRows = rows.slice(skip, skip + limit);
  const payload = { rows: pagedRows, total, page, limit };
  setCachedPerf(cacheKey, payload);
  res.json(payload);
});

export default router;
