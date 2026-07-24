import express from "express";
import { q } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ah, uuidParams, isUuid, s, isoDate } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

// Listado reciente (opcional ?patient_id= para historia clínica)
router.get("/", ah(async (req, res) => {
  const { patient_id } = req.query;
  if (patient_id && !isUuid(patient_id)) return res.status(400).json({ error: "invalid_patient" });

  const r = patient_id
    ? await q(
        `SELECT a.*, p.first_name, p.last_name, p.phone
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.clinic_id=$1 AND a.patient_id=$2
         ORDER BY a.starts_at DESC
         LIMIT 200`,
        [req.user.clinicId, patient_id]
      )
    : await q(
        `SELECT a.*, p.first_name, p.last_name, p.phone
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.clinic_id=$1
         ORDER BY a.starts_at DESC
         LIMIT 200`,
        [req.user.clinicId]
      );
  res.json(r.rows);
}));

// Cola de atención inmediata
router.get("/queue", ah(async (req, res) => {
  const r = await q(
    `SELECT a.*, p.first_name, p.last_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.clinic_id=$1 AND a.status IN ('waiting','in_progress')
     ORDER BY a.created_at ASC`,
    [req.user.clinicId]
  );
  res.json(r.rows);
}));

// Crear cita programada
router.post("/", ah(async (req, res) => {
  const { patient_id, provider_id, type } = req.body || {};
  const reason = s(req.body?.reason, 500);
  const starts_at = isoDate(req.body?.starts_at);
  const ends_at = isoDate(req.body?.ends_at);

  if (!isUuid(patient_id) || !["in_person", "virtual"].includes(type) || !starts_at || !ends_at)
    return res.status(400).json({ error: "missing_fields" });
  if (new Date(ends_at) <= new Date(starts_at)) return res.status(400).json({ error: "invalid_time_range" });
  if (provider_id && !isUuid(provider_id)) return res.status(400).json({ error: "invalid_provider" });

  const pat = await q("SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2", [patient_id, req.user.clinicId]);
  if (!pat.rows[0]) return res.status(400).json({ error: "invalid_patient" });

  const r = await q(
    `INSERT INTO appointments(clinic_id, patient_id, provider_id, type, status, reason, starts_at, ends_at)
     VALUES($1,$2,$3,$4,'scheduled',$5,$6,$7) RETURNING *`,
    [req.user.clinicId, patient_id, provider_id || null, type, reason, starts_at, ends_at]
  );
  res.status(201).json(r.rows[0]);
}));

// Atención inmediata: cita "waiting" empezando ahora (30 min)
router.post("/walkin", ah(async (req, res) => {
  const { patient_id, provider_id } = req.body || {};
  const type = ["in_person", "virtual"].includes(req.body?.type) ? req.body.type : "in_person";
  const reason = s(req.body?.reason, 500) || "Atención inmediata";

  if (!isUuid(patient_id)) return res.status(400).json({ error: "missing_patient" });
  if (provider_id && !isUuid(provider_id)) return res.status(400).json({ error: "invalid_provider" });

  const pat = await q("SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2", [patient_id, req.user.clinicId]);
  if (!pat.rows[0]) return res.status(400).json({ error: "invalid_patient" });

  const now = new Date();
  const ends = new Date(now.getTime() + 30 * 60 * 1000);
  const r = await q(
    `INSERT INTO appointments(clinic_id, patient_id, provider_id, type, status, reason, starts_at, ends_at)
     VALUES($1,$2,$3,$4,'waiting',$5,$6,$7) RETURNING *`,
    [req.user.clinicId, patient_id, provider_id || null, type, reason, now.toISOString(), ends.toISOString()]
  );
  res.status(201).json(r.rows[0]);
}));

// Cambiar estado
router.post("/:id/status", uuidParams("id"), ah(async (req, res) => {
  const { status } = req.body || {};
  const allowed = ["scheduled","confirmed","waiting","in_progress","done","canceled","no_show"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "invalid_status" });

  const r = await q(
    "UPDATE appointments SET status=$1 WHERE id=$2 AND clinic_id=$3 RETURNING *",
    [status, req.params.id, req.user.clinicId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

// Detalle
router.get("/:id", uuidParams("id"), ah(async (req, res) => {
  const r = await q(
    `SELECT a.*, p.first_name, p.last_name
     FROM appointments a
     JOIN patients p ON p.id=a.patient_id
     WHERE a.id=$1 AND a.clinic_id=$2`,
    [req.params.id, req.user.clinicId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

// Sala virtual (Jitsi) — valida que la cita exista en la clínica
router.get("/:id/virtual-room", uuidParams("id"), ah(async (req, res) => {
  const a = await q("SELECT id FROM appointments WHERE id=$1 AND clinic_id=$2", [req.params.id, req.user.clinicId]);
  if (!a.rows[0]) return res.status(404).json({ error: "not_found" });

  const room = `agx-${req.user.clinicId}-${req.params.id}`.replace(/[^a-zA-Z0-9_-]/g, "");
  res.json({ url: `https://meet.jit.si/${room}` });
}));

export default router;
