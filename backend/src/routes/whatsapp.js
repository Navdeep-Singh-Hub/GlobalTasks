import { Router } from "express";
import { authRequired, requireRoles } from "../middleware/auth.js";
import { sendWhatsAppText, isWhatsAppConfigured, normalizePhone } from "../services/whatsappService.js";
import { User } from "../models/User.js";
import { clearDigestRunLock, dateKeyInTz, runMorningDigest } from "../jobs/whatsappTaskDigestScheduler.js";
import { notifyTaskAssignedWhatsApp } from "../services/whatsappTaskAssignment.js";
import { Task } from "../models/Task.js";

const router = Router();
router.use(authRequired);

router.get("/status", requireRoles("ceo", "centre_head"), async (_req, res) => {
  res.json({
    ok: true,
    provider: "meta_whatsapp_cloud_api",
    configured: isWhatsAppConfigured(),
    mode: isWhatsAppConfigured() ? "live" : "stub",
  });
});

/** Manually run morning digest (supervisor/coordinator only). Use dryRun to preview without sending. */
router.post("/trigger-morning-digest", requireRoles("ceo", "centre_head"), async (req, res, next) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const force = req.body?.force === true;
    const onlyUserId = req.body?.userId ? String(req.body.userId).trim() : "";
    const onlyPhone = req.body?.phone ? String(req.body.phone).trim() : "";
    const dateKey = dateKeyInTz();

    if (force && !dryRun) {
      await clearDigestRunLock("morning", dateKey);
    }

    const stats = await runMorningDigest(new Date(), {
      dryRun,
      onlyUserId: onlyUserId || undefined,
      onlyPhone: onlyPhone || undefined,
    });

    res.json({
      ok: true,
      dryRun,
      dateKey,
      configured: isWhatsAppConfigured(),
      note: "Morning digest only goes to active supervisors/coordinators with a valid phone.",
      stats,
    });
  } catch (e) {
    next(e);
  }
});

/** Test instant task-assign WhatsApp for a task id (uses latest assignee or body.phone). */
router.post("/test-task-assigned", requireRoles("ceo", "centre_head"), async (req, res, next) => {
  try {
    const taskId = String(req.body?.taskId || "").trim();
    if (!taskId) return res.status(400).json({ message: "taskId is required" });
    const task = await Task.findById(taskId).select("_id title assignees createdBy").lean();
    if (!task) return res.status(404).json({ message: "Task not found" });

    let assigneeIds = (task.assignees || []).map((id) => String(id));
    const phone = String(req.body?.phone || "").trim();
    if (phone) {
      const want = normalizePhone(phone);
      const candidates = await User.find({ active: true }).select("_id phone").lean();
      const u = candidates.find((row) => normalizePhone(row.phone) === want);
      if (u) assigneeIds = [String(u._id)];
    }
    if (!assigneeIds.length) return res.status(400).json({ message: "Task has no assignees" });

    const result = await notifyTaskAssignedWhatsApp({
      taskId: task._id,
      assigneeIds,
      assignedByUserId: req.userId,
    });
    res.json({ ok: true, configured: isWhatsAppConfigured(), result });
  } catch (e) {
    next(e);
  }
});

router.post("/send-test", requireRoles("ceo", "centre_head"), async (req, res, next) => {
  try {
    const to = String(req.body.to || "").trim();
    const text = String(req.body.text || "").trim() || "GlobalTasks WhatsApp test message.";
    if (!to) return res.status(400).json({ message: "Recipient phone is required." });
    const result = await sendWhatsAppText({ to, text, fallbackToAdmin: false });
    res.json({
      ok: true,
      mode: result?.stub ? "stub" : "live",
      to,
      result,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/send-daily-reminders", requireRoles("ceo", "centre_head"), async (req, res) => {
  const date = req.body.date || new Date().toISOString().slice(0, 10);
  res.json({
    ok: true,
    status: "stub",
    action: "send_daily_reminders",
    date,
    message: "WhatsApp provider integration pending. Endpoint contract is active.",
  });
});

router.post("/send-ceo-summary", requireRoles("ceo"), async (req, res) => {
  const date = req.body.date || new Date().toISOString().slice(0, 10);
  res.json({
    ok: true,
    status: "stub",
    action: "send_ceo_summary",
    date,
    message: "WhatsApp provider integration pending. Endpoint contract is active.",
  });
});

router.post("/webhook", async (req, res) => {
  // Accept callback payload from provider (stub behavior).
  res.json({
    ok: true,
    status: "stub",
    action: "webhook_received",
    receivedAt: new Date().toISOString(),
    keys: Object.keys(req.body || {}),
  });
});

export default router;
