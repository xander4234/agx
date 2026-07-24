import express from "express";
import { q } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ah } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

/*
 * Estadísticas del consultorio (todo filtrado por clinic_id):
 *  - pacientes nuevos por mes (últimos 6 meses)
 *  - ingresos por mes (últimos 6 meses)
 *  - diagnósticos más frecuentes
 *  - citas por estado (incluye ausentismo)
 *  - horas con más citas
 */
router.get("/overview", ah(async (req, res) => {
  const cid = req.user.clinicId;

  const [newPatients, income, topDx, apptStatus, busyHours] = await Promise.all([
    q(`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
       FROM patients WHERE clinic_id=$1 AND created_at > now() - interval '6 months'
       GROUP BY 1 ORDER BY 1`, [cid]),
    q(`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COALESCE(SUM(amount),0) AS total
       FROM payments WHERE clinic_id=$1 AND status='paid' AND created_at > now() - interval '6 months'
       GROUP BY 1 ORDER BY 1`, [cid]),
    q(`SELECT COALESCE(NULLIF(TRIM(cie10_desc), ''), NULLIF(TRIM(assessment), '')) AS dx,
              MAX(cie10_code) AS code, COUNT(*)::int AS count
       FROM encounters
       WHERE clinic_id=$1 AND (NULLIF(TRIM(cie10_desc), '') IS NOT NULL OR NULLIF(TRIM(assessment), '') IS NOT NULL)
       GROUP BY 1 ORDER BY count DESC LIMIT 8`, [cid]),
    q(`SELECT status, COUNT(*)::int AS count
       FROM appointments WHERE clinic_id=$1 AND starts_at > now() - interval '3 months'
       GROUP BY status`, [cid]),
    q(`SELECT EXTRACT(HOUR FROM starts_at)::int AS hour, COUNT(*)::int AS count
       FROM appointments WHERE clinic_id=$1 AND starts_at > now() - interval '3 months'
       GROUP BY 1 ORDER BY count DESC LIMIT 5`, [cid]),
  ]);

  // ausentismo: no_show / (done + no_show)
  const byStatus = Object.fromEntries(apptStatus.rows.map((r) => [r.status, r.count]));
  const attended = byStatus.done || 0;
  const missed = byStatus.no_show || 0;
  const absentismRate = attended + missed > 0 ? Math.round((missed / (attended + missed)) * 100) : 0;

  res.json({
    new_patients_by_month: newPatients.rows,
    income_by_month: income.rows,
    top_diagnoses: topDx.rows,
    appointments_by_status: byStatus,
    absentism_rate: absentismRate,
    busy_hours: busyHours.rows,
  });
}));

// Cumpleaños de hoy (para el dashboard)
router.get("/birthdays", ah(async (req, res) => {
  const r = await q(
    `SELECT id, first_name, last_name, phone, birth_date,
            EXTRACT(YEAR FROM AGE(birth_date))::int AS age
     FROM patients
     WHERE clinic_id=$1 AND birth_date IS NOT NULL
       AND EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(DAY FROM birth_date) = EXTRACT(DAY FROM CURRENT_DATE)
     ORDER BY first_name LIMIT 20`,
    [req.user.clinicId]
  );
  res.json(r.rows);
}));

export default router;
