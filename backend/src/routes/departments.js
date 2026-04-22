import { Router } from "express";
import { Department } from "../models/Department.js";
import { authRequired, requireManagement } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

router.get("/", async (_req, res) => {
  const departments = await Department.find().sort({ name: 1 }).lean();
  res.json({ departments });
});

router.post("/", requireManagement, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const code = String(req.body.code || "").trim().toUpperCase();
  if (!name || !code) return res.status(400).json({ message: "Name and code are required" });
  const exists = await Department.findOne({ $or: [{ name }, { code }] }).lean();
  if (exists) return res.status(409).json({ message: "Department name/code already exists" });
  const department = await Department.create({ name, code, active: req.body.active !== false });
  res.status(201).json({ department });
});

router.patch("/:id", requireManagement, async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) return res.status(404).json({ message: "Department not found" });
  if (req.body.name !== undefined) department.name = String(req.body.name || "").trim();
  if (req.body.code !== undefined) department.code = String(req.body.code || "").trim().toUpperCase();
  if (typeof req.body.active === "boolean") department.active = req.body.active;
  await department.save();
  res.json({ department });
});

export default router;
