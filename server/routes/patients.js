import express from "express";
import { q } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, uuidParams, s, int, isoDate, isEmail } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

// Listado con búsqueda y paginación: /api/patients?search=juan&limit=50&offset=0
router.get("/", ah(async (req, res) => {
  const limit = int(req.query.limit, 1, 200) ?? 50;
  const offset = int(req.query.offset, 0, 100000) ?? 0;
  const search = s(req.query.search, 100);

  let rows;
  if (search) {
    rows = await q(
      `SELECT * FROM patients
       WHERE clinic_id=$1
         AND (first_name ILIKE $2 OR last_name ILIKE $2 OR id_number ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [req.user.clinicId, `%${search}%`, limit, offset]
    );
  } else {
    rows = await q(
      "SELECT * FROM patients WHERE clinic_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [req.user.clinicId, limit, offset]
    );
  }
  res.json(rows.rows);
}));

function parsePatientBody(body = {}) {
  const email = s(body.email, 254);
  return {
    first_name: s(body.first_name, 80),
    last_name: s(body.last_name, 80),
    id_number: s(body.id_number, 40),
    phone: s(body.phone, 40),
    email: email && isEmail(email) ? email.toLowerCase() : null,
    birth_date: isoDate(body.birth_date),
    sex: ["male", "female", "other"].includes(body.sex) ? body.sex : null,
    allergies: s(body.allergies, 1000),
    conditions: s(body.conditions, 1000),
    notes: s(body.notes, 2000),
  };
}

router.post("/", ah(async (req, res) => {
  const p = parsePatientBody(req.body);
  if (!p.first_name || !p.last_name) return res.status(400).json({ error: "missing_name" });

  const r = await q(
    `INSERT INTO patients(
      clinic_id, first_name, last_name, id_number, phone, email, birth_date, sex,
      allergies, conditions, notes
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.user.clinicId, p.first_name, p.last_name, p.id_number, p.phone, p.email,
     p.birth_date, p.sex, p.allergies, p.conditions, p.notes]
  );
  res.status(201).json(r.rows[0]);
}));

router.get("/:id", uuidParams("id"), ah(async (req, res) => {
  const r = await q("SELECT * FROM patients WHERE id=$1 AND clinic_id=$2", [req.params.id, req.user.clinicId]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

router.put("/:id", uuidParams("id"), ah(async (req, res) => {
  const allowed = ["first_name","last_name","id_number","phone","email","birth_date","sex","allergies","conditions","notes"];
  const parsed = parsePatientBody(req.body);
  const updates = [];
  const values = [req.params.id, req.user.clinicId];
  let idx = 3;

  for (const f of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates.push(`${f}=$${idx++}`);
      values.push(parsed[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "no_updates" });

  const r = await q(
    `UPDATE patients SET ${updates.join(", ")} WHERE id=$1 AND clinic_id=$2 RETURNING *`,
    values
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

// Solo admin puede eliminar (borra en cascada citas, signos, recetas del paciente)
router.delete("/:id", uuidParams("id"), requireRole("admin"), ah(async (req, res) => {
  const r = await q("DELETE FROM patients WHERE id=$1 AND clinic_id=$2 RETURNING id", [req.params.id, req.user.clinicId]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
}));

export default router;
