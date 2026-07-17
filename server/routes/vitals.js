import express from "express";
import { q } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ah, uuidParams, isUuid, s, int, num, isoDate } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

router.get("/patient/:patientId", uuidParams("patientId"), ah(async (req, res) => {
  const r = await q(
    "SELECT * FROM vitals WHERE clinic_id=$1 AND patient_id=$2 ORDER BY taken_at DESC LIMIT 200",
    [req.user.clinicId, req.params.patientId]
  );
  res.json(r.rows);
}));

router.post("/", ah(async (req, res) => {
  const { patient_id } = req.body || {};
  if (!isUuid(patient_id)) return res.status(400).json({ error: "missing_patient" });

  const pat = await q("SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2", [patient_id, req.user.clinicId]);
  if (!pat.rows[0]) return res.status(400).json({ error: "invalid_patient" });

  // Rangos fisiológicamente plausibles — fuera de rango se guarda como null
  const r = await q(
    `INSERT INTO vitals(
      clinic_id, patient_id, taken_at, systolic, diastolic, heart_rate, spo2,
      temperature_c, weight_kg, glucose_mgdl, notes
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.user.clinicId, patient_id,
      isoDate(req.body?.taken_at) || new Date().toISOString(),
      int(req.body?.systolic, 40, 300),
      int(req.body?.diastolic, 20, 200),
      int(req.body?.heart_rate, 20, 300),
      int(req.body?.spo2, 0, 100),
      num(req.body?.temperature_c, 25, 45),
      num(req.body?.weight_kg, 0.3, 500),
      int(req.body?.glucose_mgdl, 10, 1500),
      s(req.body?.notes, 1000),
    ]
  );
  res.status(201).json(r.rows[0]);
}));

export default router;
