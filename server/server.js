import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";

dotenv.config();

import { q, pool } from "./db.js";
import { JWT_SECRET, isUuid } from "./utils.js";
import authRoutes from "./routes/auth.js";
import patientsRoutes from "./routes/patients.js";
import appointmentsRoutes from "./routes/appointments.js";
import vitalsRoutes from "./routes/vitals.js";
import prescriptionsRoutes from "./routes/prescriptions.js";
import encountersRoutes from "./routes/encounters.js";
import filesRoutes from "./routes/files.js";
import certificatesRoutes from "./routes/certificates.js";
import chatRoutes from "./routes/chat.js";
import aiRoutes from "./routes/ai.js";

const app = express();
app.set("trust proxy", 1);

const corsOrigin = process.env.CORS_ORIGIN || true; // mismo origen por defecto
app.use(cors({ origin: corsOrigin }));
app.use(
  helmet({
    contentSecurityPolicy: false, // el frontend usa Google Fonts + socket.io inline
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: "1mb" }));
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

// Rate limits
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_attempts" },
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
});

app.get("/api/health", async (req, res) => {
  try {
    await q("SELECT 1");
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/vitals", vitalsRoutes);
app.use("/api/prescriptions", prescriptionsRoutes);
app.use("/api/encounters", encountersRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/certificates", certificatesRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiLimiter, aiRoutes);

// 404 para rutas de API desconocidas (antes del fallback del frontend)
app.use("/api", (req, res) => res.status(404).json({ error: "not_found" }));

// Servir frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.join(__dirname, "..", "web");
app.use(express.static(webDir));
app.get("*", (req, res) => res.sendFile(path.join(webDir, "index.html")));

// Error handler global — nunca filtra stack al cliente
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[error]", req.method, req.path, "-", err.message);
  if (res.headersSent) return;
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "invalid_json" });
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "file_too_large" });
  if (err.code === "23503") return res.status(400).json({ error: "invalid_reference" }); // FK violation
  if (err.code === "23505") return res.status(409).json({ error: "duplicate" }); // unique violation
  res.status(500).json({ error: "internal_error" });
});

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: corsOrigin } });

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("missing_token"));
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("invalid_token"));
  }
});

io.on("connection", (socket) => {
  socket.on("thread:join", async ({ threadId } = {}) => {
    try {
      if (!isUuid(threadId)) return;
      const r = await q("SELECT id FROM chat_threads WHERE id=$1 AND clinic_id=$2", [threadId, socket.user.clinicId]);
      if (!r.rows[0]) return;
      socket.join(`thread:${threadId}`);
    } catch (e) {
      console.error("[socket thread:join]", e.message);
    }
  });

  socket.on("message:send", async ({ threadId, body } = {}) => {
    try {
      if (!isUuid(threadId)) return;
      const text = String(body ?? "").trim().slice(0, 2000);
      if (!text) return;

      const thread = await q("SELECT id FROM chat_threads WHERE id=$1 AND clinic_id=$2", [threadId, socket.user.clinicId]);
      if (!thread.rows[0]) return;

      const senderName = socket.user.name || "Usuario";
      const ins = await q(
        "INSERT INTO chat_messages(thread_id, sender_id, sender_name, body) VALUES($1,$2,$3,$4) RETURNING *",
        [threadId, socket.user.userId, senderName, text]
      );

      io.to(`thread:${threadId}`).emit("message:new", ins.rows[0]);
    } catch (e) {
      console.error("[socket message:send]", e.message);
    }
  });
});

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  console.log(`AGX Health server corriendo en http://localhost:${PORT}`);
});

// Apagado limpio
async function shutdown(sig) {
  console.log(`\n${sig} recibido, cerrando…`);
  server.close(() => {});
  try { await pool.end(); } catch {}
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
