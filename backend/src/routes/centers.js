import { Router } from "express";
import { Center } from "../models/Center.js";
import { User } from "../models/User.js";
import { authRequired, requireManagement } from "../middleware/auth.js";
import { isCeo } from "../constants/roles.js";
import { isGlobalAccessEmail } from "../services/globalAccess.js";
import { accessibleCenterIds, centerIdAllowed } from "../services/centerAccess.js";

const router = Router();
router.use(authRequired);

router.get("/", async (req, res) => {
  let centers = await Center.find().sort({ name: 1 }).lean();
  const me = await User.findById(req.userId).select("email centerId").lean();
  if (!isCeo(req.userRole) && !isGlobalAccessEmail(me?.email)) {
    const ids = await accessibleCenterIds({ role: req.userRole, email: me?.email, centerId: me?.centerId });
    centers = centers.filter((center) => centerIdAllowed(ids, center._id));
  }
  res.json({ centers });
});

router.post("/", requireManagement, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const code = String(req.body.code || "").trim().toUpperCase();
  if (!name || !code) return res.status(400).json({ message: "Name and code are required" });
  const exists = await Center.findOne({ $or: [{ name }, { code }] }).lean();
  if (exists) return res.status(409).json({ message: "Center name/code already exists" });
  const center = await Center.create({ name, code, active: req.body.active !== false });
  res.status(201).json({ center });
});

router.patch("/:id", requireManagement, async (req, res) => {
  const center = await Center.findById(req.params.id);
  if (!center) return res.status(404).json({ message: "Center not found" });
  if (req.body.name !== undefined) center.name = String(req.body.name || "").trim();
  if (req.body.code !== undefined) center.code = String(req.body.code || "").trim().toUpperCase();
  if (typeof req.body.active === "boolean") center.active = req.body.active;
  await center.save();
  res.json({ center });
});

export default router;
