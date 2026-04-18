import { Router } from "express";
import PDFDocument from "pdfkit";
import { Task } from "../models/Task.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

router.get("/summary", async (req, res) => {
  const { from, to } = req.query;
  const filter = { deletedAt: null };
  if (from || to) {
    filter.updatedAt = {};
    if (from) filter.updatedAt.$gte = new Date(from);
    if (to) filter.updatedAt.$lte = new Date(to);
  }
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

router.get("/export", async (req, res) => {
  const format = req.query.format || "csv";
  const tasks = await Task.find({ deletedAt: null })
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

export default router;
