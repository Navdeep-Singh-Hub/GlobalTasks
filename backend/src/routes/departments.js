import { Router } from "express";
import { Department } from "../models/Department.js";
import { authRequired, requireManagement } from "../middleware/auth.js";
import { ALLOWED_DEPARTMENT_CODES, canonicalDepartmentByCode, isAllowedDepartmentCode } from "../constants/departments.js";

const router = Router();
router.use(authRequired);

router.get("/", async (_req, res) => {
  const departments = await Department.find({ code: { $in: [...ALLOWED_DEPARTMENT_CODES] } })
    .sort({ name: 1 })
    .lean();
  res.json({ departments });
});

router.post("/", requireManagement, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const code = String(req.body.code || "").trim().toUpperCase();
  if (!name || !code) return res.status(400).json({ message: "Name and code are required" });
  if (!isAllowedDepartmentCode(code)) {
    return res.status(400).json({ message: "Only predefined departments are allowed" });
  }
  const canonical = canonicalDepartmentByCode(code);
  if (!canonical) return res.status(400).json({ message: "Invalid department code" });
  if (canonical.name.toLowerCase() !== name.toLowerCase()) {
    return res.status(400).json({ message: `Name must be "${canonical.name}" for this department code` });
  }
  const exists = await Department.findOne({ $or: [{ name: canonical.name }, { code }] }).lean();
  if (exists) return res.status(409).json({ message: "Department name/code already exists" });
  const department = await Department.create({ name: canonical.name, code, active: req.body.active !== false });
  res.status(201).json({ department });
});

router.patch("/:id", requireManagement, async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) return res.status(404).json({ message: "Department not found" });
  if (!isAllowedDepartmentCode(department.code)) {
    return res.status(400).json({ message: "This department record is not in the allowed list" });
  }
  if (req.body.name !== undefined) {
    const n = String(req.body.name || "").trim();
    const canonical = canonicalDepartmentByCode(department.code);
    if (canonical && canonical.name.toLowerCase() !== n.toLowerCase()) {
      return res.status(400).json({ message: `Name must remain "${canonical.name}" for this department` });
    }
    department.name = canonical?.name ?? n;
  }
  if (req.body.code !== undefined) {
    const next = String(req.body.code || "").trim().toUpperCase();
    if (next !== department.code) {
      return res.status(400).json({ message: "Department code cannot be changed" });
    }
  }
  if (typeof req.body.active === "boolean") department.active = req.body.active;
  await department.save();
  res.json({ department });
});

export default router;
