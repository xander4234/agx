import express from "express";
import { q } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const r = await q(
    "SELECT * FROM patients WHERE clinic_id=$1 ORDER BY created_at DESC LIMIT 200",
    [req.user.clinicId]
  );
  res.json(r.rows);
});

router.post("/", async (req, res) => {
  const {
    first_name, last_name, id_number, phone, email, birth_date, sex,
    allergies, conditions, notes
  } = req.body || {};

  if (!first_name || !last_name) return res.status(400).json({ error: "missing_name" });

  const r = await q(
    `INSERT INTO patients(
      clinic_id, first_name, last_name, id_number, phone, email, birth_date, sex,
      allergies, conditions, notes
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.user.clinicId, first_name, last_name, id_number || null, phone || null, email || null,
     birth_date || null, sex || null, allergies || null, conditions || null, notes || null]
  );
  res.json(r.rows[0]);
});

router.get("/:id", async (req, res) => {
  const r = await q("SELECT * FROM patients WHERE id=$1 AND clinic_id=$2", [req.params.id, req.user.clinicId]);
  const p = r.rows[0];
  if (!p) return res.status(404).json({ error: "not_found" });
  res.json(p);
});

router.put("/:id", async (req, res) => {
  const fields = ["first_name","last_name","id_number","phone","email","birth_date","sex","allergies","conditions","notes"];
  const updates = [];
  const values = [req.params.id, req.user.clinicId];
  let idx = 3;

  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates.push(`${f}=$${idx++}`);
      values.push(req.body[f] ?? null);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "no_updates" });

  const sql = `UPDATE patients SET ${updates.join(", ")} WHERE id=$1 AND clinic_id=$2 RETURNING *`;
  const r = await q(sql, values);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
});

export default router;
