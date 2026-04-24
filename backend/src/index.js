import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import { connectDatabase } from "./config/database.js";
import { migrateLegacyUserRoles } from "./migrateUserRoles.js";
import { ensureMasterData } from "./bootstrap/masterData.js";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import tasksRoutes from "./routes/tasks.js";
import centersRoutes from "./routes/centers.js";
import departmentsRoutes from "./routes/departments.js";
import projectsRoutes from "./routes/projects.js";
import notificationsRoutes from "./routes/notifications.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportsRoutes from "./routes/reports.js";
import uploadsRoutes from "./routes/uploads.js";
import whatsappRoutes from "./routes/whatsapp.js";
import { setupSocket } from "./realtime/socket.js";
import { setSocket } from "./services/notificationService.js";
import { startTrashPurgeScheduler } from "./jobs/purgeExpiredTrash.js";
import { startEscalationScheduler } from "./jobs/escalationScheduler.js";
import { startWhatsAppTaskDigestScheduler } from "./jobs/whatsappTaskDigestScheduler.js";

const app = express();
const server = createServer(app);
const io = setupSocket(server);
setSocket(io);

const PORT = process.env.PORT || 5000;
const defaultOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const envOrigins = [
  ...(process.env.CLIENT_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => o.replace(/\/+$/g, "")),
  (process.env.CLIENT_ORIGIN || "").trim().replace(/\/+$/g, ""),
].filter(Boolean);
const allowedOrigins = new Set([...defaultOrigins, ...envOrigins]);
function isAllowedOrigin(origin) {
  if (!origin) return true;
  const o = String(origin).replace(/\/+$/g, "");
  if (allowedOrigins.has(o)) return true;
  // allow optional trailing slash mismatch: https://foo/ vs https://foo
  if (allowedOrigins.has(`${o}/`)) return true;
  if (String(origin).endsWith("/") && allowedOrigins.has(String(origin).replace(/\/+$/g, ""))) return true;
  return false;
}

app.use(
  cors({
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin || "none"}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d" }));

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    service: "task-project-api",
    recycleBinRetentionDays: Math.max(1, Number(process.env.RECYCLE_BIN_RETENTION_DAYS) || 10),
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/centers", centersRoutes);
app.use("/api/departments", departmentsRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/integrations/whatsapp", whatsappRoutes);
app.use("/api/uploads", uploadsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tms";
connectDatabase(uri)
  .then(async () => {
    await migrateLegacyUserRoles();
    await ensureMasterData();
    startTrashPurgeScheduler();
    startEscalationScheduler();
    const digestEnabled = String(process.env.WHATSAPP_DIGEST_SCHEDULER_ENABLED || "true").toLowerCase() === "true";
    if (digestEnabled) startWhatsAppTaskDigestScheduler();
    server.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
