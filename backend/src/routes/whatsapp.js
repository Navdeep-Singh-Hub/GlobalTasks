import { Router } from "express";
import { authRequired, requireRoles } from "../middleware/auth.js";
import { sendWhatsAppText, isWhatsAppConfigured } from "../services/whatsappService.js";

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

router.post("/send-test", requireRoles("ceo", "centre_head"), async (req, res, next) => {
  try {
    const to = String(req.body.to || "").trim();
    const text = String(req.body.text || "").trim() || "GlobalTasks WhatsApp test message.";
    if (!to) return res.status(400).json({ message: "Recipient phone is required." });
    const result = await sendWhatsAppText({ to, text });
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
