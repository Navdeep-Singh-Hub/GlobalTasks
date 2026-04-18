import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { authRequired } from "../middleware/auth.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
    const id = crypto.randomBytes(6).toString("hex");
    cb(null, `${Date.now()}-${id}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();
router.use(authRequired);

router.post("/", upload.array("files", 10), (req, res) => {
  const files = (req.files || []).map((f) => ({
    name: f.originalname,
    url: `/uploads/${f.filename}`,
    size: f.size,
    mimeType: f.mimetype,
  }));
  res.json({ files });
});

router.post("/voice", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  res.json({
    url: `/uploads/${req.file.filename}`,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });
});

export default router;
