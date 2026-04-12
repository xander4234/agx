import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer } from "socket.io";

import { q } from "./db.js";
import authRoutes from "./routes/auth.js";
import patientsRoutes from "./routes/patients.js";
import appointmentsRoutes from "./routes/appointments.js";
import vitalsRoutes from "./routes/vitals.js";
import prescriptionsRoutes from "./routes/prescriptions.js";
import chatRoutes from "./routes/chat.js";
import aiRoutes from "./routes/ai.js";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/vitals", vitalsRoutes);
app.use("/api/prescriptions", prescriptionsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);

// Serve frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.join(__dirname, "..", "web");
app.use(express.static(webDir));
app.get("*", (req, res) => res.sendFile(path.join(webDir, "index.html")));

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: "*" } });

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("missing_token"));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = payload;
    next();
  } catch (e) {
    next(new Error("invalid_token"));
  }
});

io.on("connection", (socket) => {
  socket.on("thread:join", async ({ threadId }) => {
    // validate thread belongs to clinic
    const r = await q("SELECT id FROM chat_threads WHERE id=$1 AND clinic_id=$2", [threadId, socket.user.clinicId]);
    if (!r.rows[0]) return;
    socket.join(`thread:${threadId}`);
  });

  socket.on("message:send", async ({ threadId, body }) => {
    if (!threadId || !body || String(body).trim().length === 0) return;

    const thread = await q("SELECT id FROM chat_threads WHERE id=$1 AND clinic_id=$2", [threadId, socket.user.clinicId]);
    if (!thread.rows[0]) return;

    const senderName = socket.user.name || "Usuario";
    const ins = await q(
      "INSERT INTO chat_messages(thread_id, sender_id, sender_name, body) VALUES($1,$2,$3,$4) RETURNING *",
      [threadId, socket.user.userId, senderName, body]
    );

    io.to(`thread:${threadId}`).emit("message:new", ins.rows[0]);
  });
});

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  console.log(`AGX Health server running on http://localhost:${PORT}`);
});
