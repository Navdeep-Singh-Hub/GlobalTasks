import { Router } from "express";
import { Notification } from "../models/Notification.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

router.get("/", async (req, res) => {
  const notifications = await Notification.find({ user: req.userId }).sort({ createdAt: -1 }).limit(30);
  const unread = await Notification.countDocuments({ user: req.userId, read: false });
  res.json({ notifications, unread });
});

router.post("/:id/read", async (req, res) => {
  await Notification.findOneAndUpdate({ _id: req.params.id, user: req.userId }, { read: true });
  res.json({ ok: true });
});

router.post("/read-all", async (req, res) => {
  await Notification.updateMany({ user: req.userId, read: false }, { read: true });
  res.json({ ok: true });
});

export default router;
