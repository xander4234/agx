import express from "express";
import { q } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

// List recent appointments
router.get("/", async (req, res) => {
  const r = await q(
    `SELECT a.*, p.first_name, p.last_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.clinic_id=$1
     ORDER BY a.starts_at DESC
     LIMIT 200`,
    [req.user.clinicId]
  );
  res.json(r.rows);
});

// Queue (immediate attention)
router.get("/queue", async (req, res) => {
  const r = await q(
    `SELECT a.*, p.first_name, p.last_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.clinic_id=$1 AND a.status IN ('waiting','in_progress')
     ORDER BY a.created_at ASC`,
    [req.user.clinicId]
  );
  res.json(r.rows);
});

// Create appointment (scheduled)
router.post("/", async (req, res) => {
  const { patient_id, provider_id, type, starts_at, ends_at, reason } = req.body || {};
  if (!patient_id || !type || !starts_at || !ends_at) return res.status(400).json({ error: "missing_fields" });

  const r = await q(
    `INSERT INTO appointments(clinic_id, patient_id, provider_id, type, status, reason, starts_at, ends_at)
     VALUES($1,$2,$3,$4,'scheduled',$5,$6,$7) RETURNING *`,
    [req.user.clinicId, patient_id, provider_id || null, type, reason || null, starts_at, ends_at]
  );
  res.json(r.rows[0]);
});

// Immediate attention: creates a "waiting" appointment starting now (30 min)
router.post("/walkin", async (req, res) => {
  const { patient_id, provider_id, type, reason } = req.body || {};
  if (!patient_id) return res.status(400).json({ error: "missing_patient" });

  const now = new Date();
  const ends = new Date(now.getTime() + 30 * 60 * 1000);
  const r = await q(
    `INSERT INTO appointments(clinic_id, patient_id, provider_id, type, status, reason, starts_at, ends_at)
     VALUES($1,$2,$3,$4,'waiting',$5,$6,$7) RETURNING *`,
    [req.user.clinicId, patient_id, provider_id || null, type || "in_person", reason || "Atención inmediata", now.toISOString(), ends.toISOString()]
  );
  res.json(r.rows[0]);
});

// Update status
router.post("/:id/status", async (req, res) => {
  const { status } = req.body || {};
  const allowed = ["scheduled","confirmed","waiting","in_progress","done","canceled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "invalid_status" });

  const r = await q(
    "UPDATE appointments SET status=$1 WHERE id=$2 AND clinic_id=$3 RETURNING *",
    [status, req.params.id, req.user.clinicId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
});

// Get single appointment
router.get("/:id", async (req, res) => {
  const r = await q(
    `SELECT a.*, p.first_name, p.last_name
     FROM appointments a
     JOIN patients p ON p.id=a.patient_id
     WHERE a.id=$1 AND a.clinic_id=$2`,
    [req.params.id, req.user.clinicId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
});

// Jitsi room link
router.get("/:id/virtual-room", async (req, res) => {
  // deterministic room per appointment
  const room = `agx-${req.user.clinicId}-${req.params.id}`.replace(/[^a-zA-Z0-9_-]/g, "");
  const url = `https://meet.jit.si/${room}`;
  res.json({ url });
});

export default router;
