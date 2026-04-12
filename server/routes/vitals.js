import express from "express";
import { q } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

router.get("/patient/:patientId", async (req, res) => {
  const r = await q(
    "SELECT * FROM vitals WHERE clinic_id=$1 AND patient_id=$2 ORDER BY taken_at DESC LIMIT 200",
    [req.user.clinicId, req.params.patientId]
  );
  res.json(r.rows);
});

router.post("/", async (req, res) => {
  const {
    patient_id, taken_at, systolic, diastolic, heart_rate, spo2,
    temperature_c, weight_kg, glucose_mgdl, notes
  } = req.body || {};

  if (!patient_id) return res.status(400).json({ error: "missing_patient" });

  const r = await q(
    `INSERT INTO vitals(
      clinic_id, patient_id, taken_at, systolic, diastolic, heart_rate, spo2,
      temperature_c, weight_kg, glucose_mgdl, notes
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.user.clinicId, patient_id,
      taken_at || new Date().toISOString(),
      systolic ?? null, diastolic ?? null, heart_rate ?? null, spo2 ?? null,
      temperature_c ?? null, weight_kg ?? null, glucose_mgdl ?? null,
      notes ?? null
    ]
  );
  res.json(r.rows[0]);
});

export default router;
