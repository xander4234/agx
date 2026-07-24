import express from "express";
import { q } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, uuidParams, isUuid, s, num } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

// Listado (últimos 200, opcional ?patient_id= o ?status=pending)
router.get("/", ah(async (req, res) => {
  const { patient_id, status } = req.query;
  if (patient_id && !isUuid(patient_id)) return res.status(400).json({ error: "invalid_patient" });
  const st = ["paid", "pending"].includes(status) ? status : null;

  const conds = ["pay.clinic_id=$1"];
  const vals = [req.user.clinicId];
  if (patient_id) { vals.push(patient_id); conds.push(`pay.patient_id=$${vals.length}`); }
  if (st) { vals.push(st); conds.push(`pay.status=$${vals.length}`); }

  const r = await q(
    `SELECT pay.*, p.first_name, p.last_name
     FROM payments pay
     JOIN patients p ON p.id = pay.patient_id
     WHERE ${conds.join(" AND ")}
     ORDER BY pay.created_at DESC LIMIT 200`,
    vals
  );
  res.json(r.rows);
}));

// Resumen de caja: hoy, este mes, pendiente
router.get("/summary", ah(async (req, res) => {
  const r = await q(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE status='paid' AND created_at::date = CURRENT_DATE), 0)                          AS today_total,
       COALESCE(SUM(amount) FILTER (WHERE status='paid' AND date_trunc('month', created_at) = date_trunc('month', now())), 0) AS month_total,
       COALESCE(SUM(amount) FILTER (WHERE status='pending'), 0)  AS pending_total,
       COUNT(*) FILTER (WHERE status='paid' AND created_at::date = CURRENT_DATE) AS today_count
     FROM payments WHERE clinic_id=$1`,
    [req.user.clinicId]
  );
  res.json(r.rows[0]);
}));

// Registrar cobro
router.post("/", ah(async (req, res) => {
  const { patient_id, appointment_id } = req.body || {};
  const amount = num(req.body?.amount, 0, 100000);
  const method = ["cash", "card", "transfer", "other"].includes(req.body?.method) ? req.body.method : "cash";
  const status = ["paid", "pending"].includes(req.body?.status) ? req.body.status : "paid";
  const concept = s(req.body?.concept, 300);

  if (!isUuid(patient_id) || amount === null) return res.status(400).json({ error: "missing_fields" });
  if (appointment_id && !isUuid(appointment_id)) return res.status(400).json({ error: "invalid_appointment" });

  const pat = await q("SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2", [patient_id, req.user.clinicId]);
  if (!pat.rows[0]) return res.status(400).json({ error: "invalid_patient" });

  const r = await q(
    `INSERT INTO payments(clinic_id, patient_id, appointment_id, amount, method, status, concept, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.clinicId, patient_id, appointment_id || null, amount, method, status, concept, req.user.userId]
  );
  res.status(201).json(r.rows[0]);
}));

// Marcar pendiente como pagado
router.post("/:id/pay", uuidParams("id"), ah(async (req, res) => {
  const r = await q(
    "UPDATE payments SET status='paid' WHERE id=$1 AND clinic_id=$2 RETURNING *",
    [req.params.id, req.user.clinicId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

// Eliminar cobro (solo admin — corrección de errores)
router.delete("/:id", uuidParams("id"), requireRole("admin"), ah(async (req, res) => {
  const r = await q("DELETE FROM payments WHERE id=$1 AND clinic_id=$2 RETURNING id", [req.params.id, req.user.clinicId]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
}));

export default router;
