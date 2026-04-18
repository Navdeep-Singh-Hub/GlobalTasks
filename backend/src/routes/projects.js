import { Router } from "express";
import { Project } from "../models/Project.js";
import { Task } from "../models/Task.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

router.get("/", async (_req, res) => {
  const projects = await Project.find().populate("owner", "name email").sort({ updatedAt: -1 });
  res.json({ projects });
});

router.get("/:id", async (req, res) => {
  const project = await Project.findById(req.params.id).populate("owner", "name email");
  if (!project) return res.status(404).json({ message: "Project not found" });
  const tasks = await Task.find({ project: project._id, deletedAt: null })
    .populate("assignees", "name")
    .sort({ updatedAt: -1 });
  const counts = await Task.aggregate([
    { $match: { project: project._id, deletedAt: null } },
    { $group: { _id: "$status", value: { $sum: 1 } } },
  ]);
  res.json({ project, tasks, progress: counts });
});

router.post("/", async (req, res) => {
  const project = await Project.create({ ...req.body, owner: req.userId });
  res.status(201).json({ project });
});

router.patch("/:id", async (req, res) => {
  const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ project });
});

router.delete("/:id", async (req, res) => {
  await Project.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
