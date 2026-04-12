import express from "express";
import { q } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

// Get or create thread for appointment
router.post("/thread", async (req, res) => {
  const { appointment_id } = req.body || {};
  if (!appointment_id) return res.status(400).json({ error: "missing_appointment" });

  const existing = await q(
    "SELECT * FROM chat_threads WHERE clinic_id=$1 AND appointment_id=$2",
    [req.user.clinicId, appointment_id]
  );
  if (existing.rows[0]) return res.json(existing.rows[0]);

  const created = await q(
    "INSERT INTO chat_threads(clinic_id, appointment_id) VALUES($1,$2) RETURNING *",
    [req.user.clinicId, appointment_id]
  );
  res.json(created.rows[0]);
});

// messages
router.get("/thread/:threadId/messages", async (req, res) => {
  const thread = await q("SELECT id FROM chat_threads WHERE id=$1 AND clinic_id=$2", [req.params.threadId, req.user.clinicId]);
  if (!thread.rows[0]) return res.status(404).json({ error: "not_found" });

  const r = await q(
    "SELECT * FROM chat_messages WHERE thread_id=$1 ORDER BY created_at ASC LIMIT 500",
    [req.params.threadId]
  );
  res.json(r.rows);
});

export default router;
