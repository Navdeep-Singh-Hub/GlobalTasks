import * as XLSX from "xlsx";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { TherapistSession } from "../models/TherapistSession.js";
import { SupervisorSheet } from "../models/SupervisorSheet.js";
import { CoordinatorSheet } from "../models/CoordinatorSheet.js";
import { normalizeWeekOffDays } from "../utils/weekoff.js";
import { isCeo } from "../constants/roles.js";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const ROLE_LABELS = {
  ceo: "CEO",
  centre_head: "Centre Head",
  coordinator: "Coordinator",
  supervisor: "Supervisor",
  operations: "Operations",
  user: "User",
  executor: "Executor",
};

const EXECUTOR_KIND_LABELS = {
  therapist: "Therapist",
  doctor: "Doctor",
  reception: "Reception",
  marketing: "Marketing",
  support: "Support",
  security: "Security",
};

function toObjectId(id) {
  if (id == null || id === "") return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id);
  if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s) {
    return new mongoose.Types.ObjectId(s);
  }
  return null;
}

function nowDateInTz(timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function eachIsoDateInclusive(from, to) {
  const out = [];
  const [fy, fm, fd] = String(from).split("-").map(Number);
  const [ty, tm, td] = String(to).split("-").map(Number);
  if (![fy, fm, fd, ty, tm, td].every((n) => Number.isFinite(n))) return out;
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  if (cur > end) return out;
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function weekdayNameFromIso(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function isWeekOffOnIso(weekOffDays, iso) {
  const normalized = normalizeWeekOffDays(weekOffDays);
  if (!normalized.length) return false;
  return normalized.includes(weekdayNameFromIso(iso));
}

function roleLine(user) {
  const role = String(user.role || "");
  const kind = String(user.executorKind || "");
  if (role === "executor" && kind) {
    return `${ROLE_LABELS.executor} - ${EXECUTOR_KIND_LABELS[kind] || kind}`;
  }
  return ROLE_LABELS[role] || role || "—";
}

function departmentLabel(user) {
  if (user?.departmentPrimary && typeof user.departmentPrimary === "object" && user.departmentPrimary.name) {
    return user.departmentPrimary.name;
  }
  return String(user?.department || "").trim() || "—";
}

function centerLabel(user) {
  if (user?.centerId && typeof user.centerId === "object") {
    const name = String(user.centerId.name || "").trim();
    return name.toLowerCase() === "mohali" ? "Barnala" : name || "—";
  }
  return "—";
}

function isTherapistLike(user) {
  const kind = String(user.executorKind || "").toLowerCase();
  const role = String(user.role || "").toLowerCase();
  return kind === "therapist" || role === "supervisor";
}

function resolveDateRange(query) {
  const today = nowDateInTz("Asia/Kolkata");
  let from = String(query.from || "").slice(0, 10);
  let to = String(query.to || "").slice(0, 10);
  if (!from && !to) {
    // Default: current calendar month (IST) through today.
    from = `${today.slice(0, 7)}-01`;
    to = today;
  } else if (!from) {
    from = to;
  } else if (!to) {
    to = today < from ? from : today;
  }
  if (to > today) to = today;
  if (from > to) from = to;
  return { from, to };
}

function expectedWorkdays(weekOffDays, from, to) {
  return eachIsoDateInclusive(from, to).filter((iso) => !isWeekOffOnIso(weekOffDays, iso));
}

function missedDates(expected, presentSet) {
  return expected.filter((d) => !presentSet.has(d));
}

/**
 * Build multi-sheet workbook buffer for everyone performance export.
 * @returns {Promise<{ buffer: Buffer, filename: string, from: string, to: string }>}
 */
export async function buildEveryonePerformanceWorkbook(req, me) {
  const { from, to } = resolveDateRange(req.query);
  const selectedCenterId = String(req.query.centerId || "").trim();
  const selectedDepartment = String(req.query.department || "").trim().toLowerCase();
  const selectedRole = String(req.query.role || "").trim().toLowerCase();

  const userQuery = { active: true };
  if (!isCeo(req.userRole)) {
    userQuery.centerId = me?.centerId || null;
  } else if (selectedCenterId) {
    userQuery.centerId = toObjectId(selectedCenterId) || selectedCenterId;
  }
  if (selectedDepartment && selectedDepartment !== "all") {
    userQuery.department = selectedDepartment;
  }
  if (selectedRole && selectedRole !== "all") {
    userQuery.role = selectedRole;
  }

  const users = await User.find(userQuery)
    .select("_id name email role executorKind centerId department departmentPrimary weekOffDays")
    .populate("centerId", "name code")
    .populate("departmentPrimary", "name code")
    .sort({ name: 1 })
    .lean();

  const userIds = users.map((u) => u._id);
  const therapistLikeIds = users.filter(isTherapistLike).map((u) => u._id);
  const supervisorIds = users.filter((u) => u.role === "supervisor").map((u) => u._id);
  const coordinatorIds = users.filter((u) => u.role === "coordinator").map((u) => u._id);

  const sessionDateQ = { sessionDate: { $gte: from, $lte: to } };
  const sheetDateQ = { sheetDate: { $gte: from, $lte: to } };
  const now = new Date();

  const [sessionRows, supervisorSheets, coordinatorSheets, taskAgg, incompleteTasks] = await Promise.all([
    therapistLikeIds.length
      ? TherapistSession.aggregate([
          { $match: { therapistId: { $in: therapistLikeIds }, ...sessionDateQ } },
          { $group: { _id: { therapistId: "$therapistId", sessionDate: "$sessionDate" } } },
        ])
      : [],
    supervisorIds.length
      ? SupervisorSheet.aggregate([
          { $match: { supervisorId: { $in: supervisorIds }, ...sheetDateQ } },
          { $group: { _id: { supervisorId: "$supervisorId", sheetDate: "$sheetDate" } } },
        ])
      : [],
    coordinatorIds.length
      ? CoordinatorSheet.aggregate([
          { $match: { coordinatorId: { $in: coordinatorIds }, ...sheetDateQ } },
          { $group: { _id: { coordinatorId: "$coordinatorId", sheetDate: "$sheetDate" } } },
        ])
      : [],
    userIds.length
      ? Task.aggregate([
          {
            $match: {
              deletedAt: null,
              assignees: { $in: userIds },
              dueDate: { $gte: new Date(`${from}T00:00:00.000`), $lte: new Date(`${to}T23:59:59.999`) },
            },
          },
          { $unwind: "$assignees" },
          { $match: { assignees: { $in: userIds } } },
          {
            $group: {
              _id: "$assignees",
              total: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
              pending: {
                $sum: {
                  $cond: [{ $in: ["$status", ["pending", "in_progress", "awaiting_approval"]] }, 1, 0],
                },
              },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$status", "overdue"] },
                        {
                          $and: [{ $ne: ["$status", "completed"] }, { $ne: ["$status", "cancelled"] }, { $lt: ["$dueDate", now] }],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
              notDone: {
                $sum: {
                  $cond: [
                    {
                      $and: [{ $ne: ["$status", "completed"] }, { $ne: ["$status", "cancelled"] }],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
      : [],
    userIds.length
      ? Task.find({
          deletedAt: null,
          assignees: { $in: userIds },
          dueDate: { $gte: new Date(`${from}T00:00:00.000`), $lte: new Date(`${to}T23:59:59.999`) },
          status: { $nin: ["completed", "cancelled"] },
        })
          .select("title status dueDate priority assignees")
          .populate("assignees", "name email role executorKind")
          .sort({ dueDate: 1 })
          .limit(5000)
          .lean()
      : [],
  ]);

  const presentSessionsByUser = new Map();
  for (const row of sessionRows) {
    const uid = String(row._id.therapistId);
    if (!presentSessionsByUser.has(uid)) presentSessionsByUser.set(uid, new Set());
    if (row._id.sessionDate) presentSessionsByUser.get(uid).add(String(row._id.sessionDate));
  }

  const presentSupSheetsByUser = new Map();
  for (const row of supervisorSheets) {
    const uid = String(row._id.supervisorId);
    if (!presentSupSheetsByUser.has(uid)) presentSupSheetsByUser.set(uid, new Set());
    if (row._id.sheetDate) presentSupSheetsByUser.get(uid).add(String(row._id.sheetDate));
  }

  const presentCoordSheetsByUser = new Map();
  for (const row of coordinatorSheets) {
    const uid = String(row._id.coordinatorId);
    if (!presentCoordSheetsByUser.has(uid)) presentCoordSheetsByUser.set(uid, new Set());
    if (row._id.sheetDate) presentCoordSheetsByUser.get(uid).add(String(row._id.sheetDate));
  }

  const tasksByUser = new Map(taskAgg.map((t) => [String(t._id), t]));

  const summaryHeader = [
    "Name",
    "Email",
    "Role",
    "Center",
    "Department",
    "Expected Workdays",
    "Missed Session Days",
    "Missed Session Dates",
    "Missing Supervisor Sheet Days",
    "Missing Supervisor Sheet Dates",
    "Missing Coordinator Sheet Days",
    "Missing Coordinator Sheet Dates",
    "Tasks Total",
    "Tasks Done",
    "Tasks Not Done",
    "Tasks Pending",
    "Tasks Overdue",
    "Tasks Cancelled",
  ];

  const missedSessionDetail = [["Name", "Email", "Role", "Center", "Department", "Missed Session Date"]];
  const missingSheetDetail = [["Name", "Email", "Role", "Center", "Department", "Sheet Type", "Missing Date"]];

  const summaryRows = [summaryHeader];

  for (const user of users) {
    const uid = String(user._id);
    const expected = expectedWorkdays(user.weekOffDays || [], from, to);
    const expectedCount = expected.length;

    let missedSessionList = [];
    let missingSupList = [];
    let missingCoordList = [];

    if (isTherapistLike(user)) {
      missedSessionList = missedDates(expected, presentSessionsByUser.get(uid) || new Set());
      for (const d of missedSessionList) {
        missedSessionDetail.push([
          user.name || "",
          user.email || "",
          roleLine(user),
          centerLabel(user),
          departmentLabel(user),
          d,
        ]);
      }
    }

    if (user.role === "supervisor") {
      missingSupList = missedDates(expected, presentSupSheetsByUser.get(uid) || new Set());
      for (const d of missingSupList) {
        missingSheetDetail.push([
          user.name || "",
          user.email || "",
          roleLine(user),
          centerLabel(user),
          departmentLabel(user),
          "Supervisor sheet",
          d,
        ]);
      }
    }

    if (user.role === "coordinator") {
      missingCoordList = missedDates(expected, presentCoordSheetsByUser.get(uid) || new Set());
      for (const d of missingCoordList) {
        missingSheetDetail.push([
          user.name || "",
          user.email || "",
          roleLine(user),
          centerLabel(user),
          departmentLabel(user),
          "Coordinator sheet",
          d,
        ]);
      }
    }

    const t = tasksByUser.get(uid) || {};
    summaryRows.push([
      user.name || "",
      user.email || "",
      roleLine(user),
      centerLabel(user),
      departmentLabel(user),
      expectedCount,
      isTherapistLike(user) ? missedSessionList.length : "—",
      isTherapistLike(user) ? missedSessionList.join(", ") : "—",
      user.role === "supervisor" ? missingSupList.length : "—",
      user.role === "supervisor" ? missingSupList.join(", ") : "—",
      user.role === "coordinator" ? missingCoordList.length : "—",
      user.role === "coordinator" ? missingCoordList.join(", ") : "—",
      Number(t.total) || 0,
      Number(t.completed) || 0,
      Number(t.notDone) || 0,
      Number(t.pending) || 0,
      Number(t.overdue) || 0,
      Number(t.cancelled) || 0,
    ]);
  }

  const incompleteRows = [
    ["Assignee", "Email", "Role", "Task", "Status", "Priority", "Due Date"],
  ];
  for (const task of incompleteTasks) {
    const assignees = Array.isArray(task.assignees) ? task.assignees : [];
    const due = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "";
    for (const a of assignees) {
      if (!a || typeof a !== "object") continue;
      if (!userIds.some((id) => String(id) === String(a._id))) continue;
      incompleteRows.push([
        a.name || "",
        a.email || "",
        roleLine(a),
        task.title || "",
        String(task.status || "").replace(/_/g, " "),
        task.priority || "",
        due,
      ]);
    }
  }

  const metaRows = [
    ["Everyone Performance Report"],
    ["From", from],
    ["To", to],
    ["Generated (IST)", nowDateInTz("Asia/Kolkata")],
    ["Staff count", users.length],
    [],
    ["Notes"],
    ["Expected workdays exclude each person's week-off days."],
    ["Therapist/supervisor missed sessions = workdays with no uploaded patient session."],
    ["Missing supervisor/coordinator sheets = workdays with no daily sheet submitted."],
    ["Task stats are for tasks due in the selected date range."],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaRows), "Report Info");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Staff Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(missedSessionDetail), "Missed Sessions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(missingSheetDetail), "Missing Sheets");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(incompleteRows), "Incomplete Tasks");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `everyone-performance-${from}-to-${to}.xlsx`;
  return { buffer, filename, from, to };
}
