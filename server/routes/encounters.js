import express from "express";
import { q } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, uuidParams, s } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

// Nota clínica (SOAP) de una cita
router.get("/appointment/:appointmentId", uuidParams("appointmentId"), ah(async (req, res) => {
  const r = await q(
    "SELECT * FROM encounters WHERE appointment_id=$1 AND clinic_id=$2",
    [req.params.appointmentId, req.user.clinicId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

// Crear/actualizar nota SOAP (upsert) — solo provider/admin
router.put("/appointment/:appointmentId", uuidParams("appointmentId"), requireRole("provider", "admin"), ah(async (req, res) => {
  const appt = await q(
    "SELECT id FROM appointments WHERE id=$1 AND clinic_id=$2",
    [req.params.appointmentId, req.user.clinicId]
  );
  if (!appt.rows[0]) return res.status(404).json({ error: "appointment_not_found" });

  const subjective = s(req.body?.subjective, 5000);
  const objective = s(req.body?.objective, 5000);
  const assessment = s(req.body?.assessment, 5000);
  const plan = s(req.body?.plan, 5000);
  const cie10_code = s(req.body?.cie10_code, 10);
  const cie10_desc = s(req.body?.cie10_desc, 200);

  const r = await q(
    `INSERT INTO encounters(clinic_id, appointment_id, subjective, objective, assessment, plan, cie10_code, cie10_desc)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (appointment_id) DO UPDATE
       SET subjective=EXCLUDED.subjective, objective=EXCLUDED.objective,
           assessment=EXCLUDED.assessment, plan=EXCLUDED.plan,
           cie10_code=EXCLUDED.cie10_code, cie10_desc=EXCLUDED.cie10_desc
     RETURNING *`,
    [req.user.clinicId, req.params.appointmentId, subjective, objective, assessment, plan, cie10_code, cie10_desc]
  );
  res.json(r.rows[0]);
}));

export default router;
