import { Router } from "express";
import PDFDocument from "pdfkit";
import { Task } from "../models/Task.js";
import { DailyReport } from "../models/DailyReport.js";
import { User } from "../models/User.js";
import { TherapistSession } from "../models/TherapistSession.js";
import { SupervisorSheet } from "../models/SupervisorSheet.js";
import { CoordinatorSheet } from "../models/CoordinatorSheet.js";
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
  req._actor = await User.findById(req.userId).select("_id role executorKind centerId").lean();
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

function dateInTz(value, timeZone = "Asia/Kolkata") {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function nowDateInTz(timeZone = "Asia/Kolkata") {
  return dateInTz(new Date(), timeZone);
}

function canAccessSupervisorSheet(req, meUser, targetSupervisorId) {
  if (isCeo(req.userRole)) return true;
  if (req.userRole === "supervisor") return String(targetSupervisorId || "") === String(req.userId || "");
  return false;
}

/** Legacy docs had no instanceKey; normalize so compound unique index works. */
async function migrateLegacySupervisorSheets(supervisorId, sheetDate, centerId) {
  await SupervisorSheet.updateMany(
    {
      supervisorId,
      sheetDate,
      centerId: centerId ?? null,
      $or: [{ instanceKey: { $exists: false } }, { instanceKey: null }, { instanceKey: "" }],
    },
    { $set: { instanceKey: "default" } }
  );
}

function canAccessCoordinatorSheet(req, _meUser, targetCoordinatorId) {
  if (isCeo(req.userRole)) return true;
  if (req.userRole === "coordinator") return String(targetCoordinatorId || "") === String(req.userId || "");
  return false;
}

async function getSupervisorTherapistIds(supervisorId, centerId) {
  const descendants = await getDescendantUsers(supervisorId, centerId || null);
  const descendantIds = descendants
    .filter((u) => u.role === "executor" && u.executorKind === "therapist")
    .map((u) => String(u._id));

  const directReportIds = await User.distinct("_id", {
    reportsTo: supervisorId,
    role: "executor",
    executorKind: "therapist",
    active: true,
    ...(centerId ? { centerId } : {}),
  });

  const taskAssignedIds = await Task.distinct("assignees", {
    createdBy: supervisorId,
    deletedAt: null,
    ...(centerId ? { centerId } : {}),
  });

  const sessionLinkedIds = await TherapistSession.distinct("therapistId", {
    $or: [{ createdBy: supervisorId }, { markedBy: supervisorId }],
    ...(centerId ? { centerId } : {}),
  });

  const candidateIds = Array.from(
    new Set([
      ...descendantIds,
      ...directReportIds.map((id) => String(id)),
      ...taskAssignedIds.map((id) => String(id)),
      ...sessionLinkedIds.map((id) => String(id)),
    ])
  );
  if (!candidateIds.length) return [];

  const therapistIds = await User.find({
    _id: { $in: candidateIds },
    role: "executor",
    executorKind: "therapist",
    active: true,
    ...(centerId ? { centerId } : {}),
  }).distinct("_id");
  return therapistIds;
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
  const isSupervisor = meUser?.role === "supervisor";
  if (!isTherapist && !isSupervisor) {
    return res.status(403).json({ message: "Only therapists or supervisors can submit sessions" });
  }

  const uploader = await User.findById(req.userId).select("_id role executorKind centerId departmentPrimary weekOffDays").lean();
  if (!uploader) return res.status(404).json({ message: "User not found" });
  if (!isCeo(req.userRole) && String(uploader.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "User must belong to your center" });
  }

  const sessionDate = String(req.body.sessionDate || new Date().toISOString().slice(0, 10));
  if (isWeekOffOnDate(uploader.weekOffDays || [], sessionDate)) {
    return res.status(400).json({ message: "Session cannot be uploaded on week off day." });
  }
  const patientName = String(req.body.patientName || "").trim();
  if (!patientName) return res.status(400).json({ message: "Patient name is required" });
  const durationMinutes =
    Number(req.body.durationMinutes) > 0
      ? Number(req.body.durationMinutes)
      : Number(req.body.startedAt && req.body.endedAt ? 30 : 0);

  const session = await TherapistSession.create({
    therapistId: uploader._id,
    centerId: uploader.centerId,
    departmentId: uploader.departmentPrimary || null,
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
  const isTherapist = req.userRole === "executor" && me?.role === "executor" && me?.executorKind === "therapist";
  const isSupervisor = req.userRole === "supervisor" && me?.role === "supervisor";
  if (!isManagement(req.userRole) && !isTherapist && !isSupervisor) {
    return res.status(403).json({ message: "Only therapists or supervisors can view sessions" });
  }
  const { page, limit, skip } = parsePageLimit(req.query, 30, 100);

  const q = {};
  if (req.query.from || req.query.to) {
    q.sessionDate = {};
    if (req.query.from) q.sessionDate.$gte = String(req.query.from);
    if (req.query.to) q.sessionDate.$lte = String(req.query.to);
  }
  if (req.query.therapistId) q.therapistId = req.query.therapistId;
  if (isTherapist) q.therapistId = req.userId;
  if (isSupervisor && String(req.query.scope || "").toLowerCase() === "self") q.therapistId = req.userId;
  if (!isCeo(req.userRole)) q.centerId = me?.centerId || null;
  if (req.userRole === "supervisor" && !q.therapistId) {
    const therapistIds = await getSupervisorTherapistIds(req.userId, me?.centerId || null);
    if (!therapistIds.length) q.therapistId = { $in: [] };
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

router.patch("/therapist-sessions/:id", async (req, res) => {
  const me = await actor(req);
  const meUser = await User.findById(req.userId).select("_id role executorKind centerId").lean();
  const isTherapist = meUser?.role === "executor" && meUser?.executorKind === "therapist";
  const isSupervisor = meUser?.role === "supervisor";
  if (!isTherapist && !isSupervisor) {
    return res.status(403).json({ message: "Only therapists or supervisors can edit sessions" });
  }

  const session = await TherapistSession.findById(req.params.id);
  if (!session) return res.status(404).json({ message: "Session not found" });
  if (!isCeo(req.userRole) && String(session.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can edit sessions from your center only" });
  }
  if (String(session.createdBy || "") !== String(req.userId || "")) {
    return res.status(403).json({ message: "Only the uploader can edit this session" });
  }
  const uploadDate = dateInTz(session.createdAt, "Asia/Kolkata");
  const today = nowDateInTz("Asia/Kolkata");
  if (!uploadDate || uploadDate !== today) {
    return res.status(403).json({ message: "Session can be edited only on the upload day" });
  }

  const nextSessionDate = req.body.sessionDate !== undefined ? String(req.body.sessionDate || "").trim() : session.sessionDate;
  const patientName = req.body.patientName !== undefined ? String(req.body.patientName || "").trim() : session.patientName;
  if (!patientName) return res.status(400).json({ message: "Patient name is required" });

  const startedAt = req.body.startedAt !== undefined ? String(req.body.startedAt || "") : session.startedAt;
  const endedAt = req.body.endedAt !== undefined ? String(req.body.endedAt || "") : session.endedAt;
  const requestedDuration = req.body.durationMinutes !== undefined ? Number(req.body.durationMinutes) : Number(session.durationMinutes || 0);
  const durationMinutes = requestedDuration > 0 ? requestedDuration : Number(startedAt && endedAt ? 30 : 0);

  session.sessionDate = nextSessionDate || session.sessionDate;
  session.patientName = patientName;
  session.patientCode = req.body.patientCode !== undefined ? String(req.body.patientCode || "") : session.patientCode;
  session.startedAt = startedAt;
  session.endedAt = endedAt;
  session.durationMinutes = durationMinutes;
  if (req.body.videoUploaded !== undefined) session.videoUploaded = Boolean(req.body.videoUploaded);
  if (req.body.videoUrl !== undefined) session.videoUrl = String(req.body.videoUrl || "");
  if (req.body.attendanceMarked !== undefined) session.attendanceMarked = Boolean(req.body.attendanceMarked);
  if (req.body.planUpdated15d !== undefined) session.planUpdated15d = Boolean(req.body.planUpdated15d);
  if (req.body.newActivity15d !== undefined) session.newActivity15d = Boolean(req.body.newActivity15d);
  if (req.body.newActivityText !== undefined) session.newActivityText = String(req.body.newActivityText || "");
  if (req.body.monthlyTestDone !== undefined) session.monthlyTestDone = Boolean(req.body.monthlyTestDone);
  if (req.body.monthlyTestNotes !== undefined) session.monthlyTestNotes = String(req.body.monthlyTestNotes || "");

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
    const therapistIds = await getSupervisorTherapistIds(req.userId, me?.centerId || null);
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

  const therapistQuery = {
    active: true,
    $or: [{ role: "supervisor" }, { role: "executor", executorKind: "therapist" }],
  };
  if (!isCeo(req.userRole)) therapistQuery.centerId = me?.centerId || null;
  if (req.userRole === "supervisor") {
    const therapistIds = await getSupervisorTherapistIds(req.userId, me?.centerId || null);
    const allowed = [String(req.userId), ...therapistIds.map((id) => String(id))];
    therapistQuery._id = allowed.length ? { $in: allowed } : { $in: [] };
  } else if (req.query.therapistId) {
    therapistQuery._id = req.query.therapistId;
  }

  const users = await User.find(therapistQuery)
    .select("_id name email centerId role executorKind")
    .populate("centerId", "name code")
    .lean();
  const summaryById = new Map(summary.map((s) => [String(s._id), s]));

  const rows = users
    .map((u) => {
      const stat = summaryById.get(String(u._id));
      return {
        _id: String(u._id),
        therapist: u,
        sessions: stat?.sessions || 0,
        patientsCovered: stat?.patientsCovered || 0,
        attendanceDays: stat?.attendanceDays || 0,
        planUpdates15d: stat?.planUpdates15d || 0,
        newActivities15d: stat?.newActivities15d || 0,
        monthlyTests: stat?.monthlyTests || 0,
        avgSupervisorScore: stat?.avgSupervisorScore || 0,
      };
    })
    .sort((a, b) => b.sessions - a.sessions || a.therapist.name.localeCompare(b.therapist.name, undefined, { sensitivity: "base" }));
  const total = rows.length;
  const pagedRows = rows.slice(skip, skip + limit);
  const payload = { rows: pagedRows, total, page, limit };
  setCachedPerf(cacheKey, payload);
  res.json(payload);
});

router.get("/supervisor-sheet/instances", async (req, res) => {
  const me = await actor(req);
  const targetSupervisorId = String(req.query.supervisorId || req.userId || "");
  if (!canAccessSupervisorSheet(req, me, targetSupervisorId)) {
    return res.status(403).json({ message: "You can access supervisor sheet for allowed users only" });
  }
  const supervisorUser = await User.findById(targetSupervisorId).select("_id role centerId").lean();
  if (!supervisorUser || supervisorUser.role !== "supervisor") {
    return res.status(404).json({ message: "Supervisor not found" });
  }
  if (!isCeo(req.userRole) && String(supervisorUser.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can access sheets for your center only" });
  }
  const sheetDate = String(req.query.sheetDate || nowDateInTz("Asia/Kolkata"));
  const centerId = supervisorUser.centerId || null;
  await migrateLegacySupervisorSheets(targetSupervisorId, sheetDate, centerId);
  const sheets = await SupervisorSheet.find({ supervisorId: targetSupervisorId, sheetDate, centerId })
    .select("instanceKey label updatedAt")
    .lean();
  const instances = sheets.map((s) => ({
    instanceKey: String(s.instanceKey || "default"),
    label: String(s.label || ""),
    updatedAt: s.updatedAt,
  }));
  instances.sort((a, b) => {
    if (a.instanceKey === "default") return -1;
    if (b.instanceKey === "default") return 1;
    return a.instanceKey.localeCompare(b.instanceKey);
  });
  res.json({ sheetDate, instances });
});

router.get("/supervisor-sheet", async (req, res) => {
  const me = await actor(req);
  const targetSupervisorId = String(req.query.supervisorId || req.userId || "");
  if (!canAccessSupervisorSheet(req, me, targetSupervisorId)) {
    return res.status(403).json({ message: "You can access supervisor sheet for allowed users only" });
  }
  const supervisorUser = await User.findById(targetSupervisorId).select("_id role centerId").lean();
  if (!supervisorUser || supervisorUser.role !== "supervisor") {
    return res.status(404).json({ message: "Supervisor not found" });
  }
  const sheetDate = String(req.query.sheetDate || nowDateInTz("Asia/Kolkata"));
  const centerId = supervisorUser.centerId || null;
  if (!isCeo(req.userRole) && String(supervisorUser.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can access sheets for your center only" });
  }
  await migrateLegacySupervisorSheets(targetSupervisorId, sheetDate, centerId);
  const instanceKey = String(req.query.instanceKey || "default");
  const where = { supervisorId: targetSupervisorId, sheetDate, centerId, instanceKey };
  const sheet = await SupervisorSheet.findOne(where).lean();
  res.json({ sheetDate, instanceKey, entries: sheet?.entries || [], label: sheet?.label || "" });
});

router.put("/supervisor-sheet", async (req, res) => {
  const me = await actor(req);
  const targetSupervisorId = String(req.body.supervisorId || req.userId || "");
  if (!canAccessSupervisorSheet(req, me, targetSupervisorId)) {
    return res.status(403).json({ message: "You can update supervisor sheet for allowed users only" });
  }
  const supervisorUser = await User.findById(targetSupervisorId).select("_id role centerId").lean();
  if (!supervisorUser || supervisorUser.role !== "supervisor") {
    return res.status(404).json({ message: "Supervisor not found" });
  }
  if (!isCeo(req.userRole) && String(supervisorUser.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can update sheets for your center only" });
  }
  const sheetDate = String(req.body.sheetDate || nowDateInTz("Asia/Kolkata"));
  const centerId = supervisorUser.centerId || null;
  await migrateLegacySupervisorSheets(targetSupervisorId, sheetDate, centerId);
  const instanceKey = String(req.body.instanceKey || "default");
  const label = typeof req.body.label === "string" ? req.body.label.trim() : "";
  const entriesInput = Array.isArray(req.body.entries) ? req.body.entries : [];
  const entries = entriesInput.map((entry) => ({
    taskKey: String(entry?.taskKey || "").trim(),
    status: String(entry?.status || "").toLowerCase() === "yes" ? "yes" : "no",
    remarks: String(entry?.remarks || "").trim(),
  }));
  const filteredEntries = entries.filter((e) => e.taskKey);
  const payload = {
    supervisorId: targetSupervisorId,
    centerId,
    sheetDate,
    instanceKey,
    label,
    entries: filteredEntries,
  };
  const where = { supervisorId: targetSupervisorId, sheetDate, centerId, instanceKey };
  const sheet = await SupervisorSheet.findOneAndUpdate(where, { $set: payload }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  res.json({ sheetDate: sheet.sheetDate, instanceKey: sheet.instanceKey || instanceKey, entries: sheet.entries || [], label: sheet.label || "" });
});

router.delete("/supervisor-sheet", async (req, res) => {
  try {
    const me = await actor(req);
    const targetSupervisorId = String(req.query.supervisorId || req.body.supervisorId || req.userId || "");
    const sheetDate = String(req.query.sheetDate || req.body.sheetDate || "");
    const instanceKey = String(req.query.instanceKey || req.body.instanceKey || "");
    if (!canAccessSupervisorSheet(req, me, targetSupervisorId)) {
      return res.status(403).json({ message: "You can update supervisor sheet for allowed users only" });
    }
    if (!sheetDate) return res.status(400).json({ message: "sheetDate is required" });
    if (!instanceKey || instanceKey === "default") {
      return res.status(400).json({ message: "Only additional sheets can be removed." });
    }
    const supervisorUser = await User.findById(targetSupervisorId).select("_id role centerId").lean();
    if (!supervisorUser || supervisorUser.role !== "supervisor") {
      return res.status(404).json({ message: "Supervisor not found" });
    }
    if (!isCeo(req.userRole) && String(supervisorUser.centerId || "") !== String(me?.centerId || "")) {
      return res.status(403).json({ message: "You can update sheets for your center only" });
    }
    const centerId = supervisorUser.centerId || null;
    const total = await SupervisorSheet.countDocuments({ supervisorId: targetSupervisorId, sheetDate, centerId });
    if (total <= 1) {
      return res.status(400).json({ message: "Cannot remove the only sheet for this date." });
    }
    const deleted = await SupervisorSheet.deleteOne({ supervisorId: targetSupervisorId, sheetDate, centerId, instanceKey });
    if (!deleted.deletedCount) return res.status(404).json({ message: "Sheet not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e instanceof Error ? e.message : "Could not delete sheet" });
  }
});

router.get("/coordinator-sheet", async (req, res) => {
  const me = await actor(req);
  const targetCoordinatorId = String(req.query.coordinatorId || req.userId || "");
  if (!canAccessCoordinatorSheet(req, me, targetCoordinatorId)) {
    return res.status(403).json({ message: "You can access coordinator sheet for allowed users only" });
  }
  const coordinatorUser = await User.findById(targetCoordinatorId).select("_id role centerId").lean();
  if (!coordinatorUser || coordinatorUser.role !== "coordinator") {
    return res.status(404).json({ message: "Coordinator not found" });
  }
  const sheetDate = String(req.query.sheetDate || nowDateInTz("Asia/Kolkata"));
  const where = { coordinatorId: targetCoordinatorId, sheetDate, centerId: coordinatorUser.centerId || null };
  if (!isCeo(req.userRole) && String(coordinatorUser.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can access sheets for your center only" });
  }
  const sheet = await CoordinatorSheet.findOne(where).lean();
  res.json({ sheetDate, entries: sheet?.entries || [] });
});

router.put("/coordinator-sheet", async (req, res) => {
  const me = await actor(req);
  const targetCoordinatorId = String(req.body.coordinatorId || req.userId || "");
  if (!canAccessCoordinatorSheet(req, me, targetCoordinatorId)) {
    return res.status(403).json({ message: "You can update coordinator sheet for allowed users only" });
  }
  const coordinatorUser = await User.findById(targetCoordinatorId).select("_id role centerId").lean();
  if (!coordinatorUser || coordinatorUser.role !== "coordinator") {
    return res.status(404).json({ message: "Coordinator not found" });
  }
  if (!isCeo(req.userRole) && String(coordinatorUser.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can update sheets for your center only" });
  }
  const sheetDate = String(req.body.sheetDate || nowDateInTz("Asia/Kolkata"));
  const entriesInput = Array.isArray(req.body.entries) ? req.body.entries : [];
  const entries = entriesInput.map((entry) => ({
    taskKey: String(entry?.taskKey || "").trim(),
    status: String(entry?.status || "").toLowerCase() === "yes" ? "yes" : "no",
    remarks: String(entry?.remarks || "").trim(),
  }));
  const filteredEntries = entries.filter((e) => e.taskKey);
  const payload = {
    coordinatorId: targetCoordinatorId,
    centerId: coordinatorUser.centerId || null,
    sheetDate,
    entries: filteredEntries,
  };
  const where = { coordinatorId: targetCoordinatorId, sheetDate, centerId: coordinatorUser.centerId || null };
  const sheet = await CoordinatorSheet.findOneAndUpdate(where, { $set: payload }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  res.json({ sheetDate: sheet.sheetDate, entries: sheet.entries || [] });
});

router.get("/supervisor-performance", async (req, res) => {
  const me = await actor(req);
  if (!isManagement(req.userRole)) return res.status(403).json({ message: "Insufficient permissions" });
  const { page, limit, skip } = parsePageLimit(req.query, 25, 100);

  const userQuery = { role: "supervisor", active: true };
  if (!isCeo(req.userRole)) userQuery.centerId = me?.centerId || null;
  if (req.query.supervisorId) userQuery._id = req.query.supervisorId;

  const supervisors = await User.find(userQuery)
    .select("_id name email centerId")
    .populate("centerId", "name code")
    .lean();
  supervisors.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const total = supervisors.length;
  const pageSupervisors = supervisors.slice(skip, skip + limit);
  const supervisorIds = pageSupervisors.map((s) => s._id);

  const sheetQuery = { supervisorId: { $in: supervisorIds } };
  if (req.query.from || req.query.to) {
    sheetQuery.sheetDate = {};
    if (req.query.from) sheetQuery.sheetDate.$gte = String(req.query.from);
    if (req.query.to) sheetQuery.sheetDate.$lte = String(req.query.to);
  }
  if (!isCeo(req.userRole)) sheetQuery.centerId = me?.centerId || null;

  const sheets = supervisorIds.length ? await SupervisorSheet.find(sheetQuery).lean() : [];
  const bySupervisor = new Map();
  for (const s of sheets) {
    const key = String(s.supervisorId);
    if (!bySupervisor.has(key)) bySupervisor.set(key, []);
    bySupervisor.get(key).push(s);
  }

  const rows = pageSupervisors.map((s) => {
    const list = bySupervisor.get(String(s._id)) || [];
    const uniqueDates = new Set(list.map((doc) => String(doc.sheetDate || "")));
    let yesCount = 0;
    let noCount = 0;
    let remarksCount = 0;
    let lastUpdatedAt = null;
    for (const day of list) {
      if (!lastUpdatedAt || new Date(day.updatedAt).getTime() > new Date(lastUpdatedAt).getTime()) {
        lastUpdatedAt = day.updatedAt;
      }
      for (const e of day.entries || []) {
        if (e.status === "yes") yesCount += 1;
        else noCount += 1;
        if (String(e.remarks || "").trim()) remarksCount += 1;
      }
    }
    return {
      _id: String(s._id),
      supervisor: s,
      daysSubmitted: uniqueDates.size,
      yesCount,
      noCount,
      remarksCount,
      lastUpdatedAt,
    };
  });

  res.json({ rows, total, page, limit });
});

router.get("/supervisor-performance/details", async (req, res) => {
  const me = await actor(req);
  if (!isManagement(req.userRole)) return res.status(403).json({ message: "Insufficient permissions" });
  const supervisorId = String(req.query.supervisorId || "");
  if (!supervisorId) return res.status(400).json({ message: "supervisorId is required" });
  const { page, limit, skip } = parsePageLimit(req.query, 20, 100);

  const supervisor = await User.findById(supervisorId).select("_id role centerId").lean();
  if (!supervisor || supervisor.role !== "supervisor") return res.status(404).json({ message: "Supervisor not found" });
  if (!isCeo(req.userRole) && String(supervisor.centerId || "") !== String(me?.centerId || "")) {
    return res.status(403).json({ message: "You can access supervisors in your center only" });
  }

  const q = { supervisorId: supervisor._id, centerId: supervisor.centerId || null };
  if (req.query.from || req.query.to) {
    q.sheetDate = {};
    if (req.query.from) q.sheetDate.$gte = String(req.query.from);
    if (req.query.to) q.sheetDate.$lte = String(req.query.to);
  }
  const [sheets, total] = await Promise.all([
    SupervisorSheet.find(q).sort({ sheetDate: -1, instanceKey: 1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
    SupervisorSheet.countDocuments(q),
  ]);
  res.json({ sheets, total, page, limit });
});

export default router;
