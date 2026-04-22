import { Router } from "express";
import { authRequired, requireRoles } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

/**
 * Stub endpoints for Phase-4 WhatsApp integration.
 * Replace internal implementation with provider SDK (Twilio/Meta/etc.).
 */
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
