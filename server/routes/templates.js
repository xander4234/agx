import express from "express";
import { q } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, uuidParams, s } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

/*
 * Plantillas rápidas por consultorio:
 *  - type 'rx': receta frecuente  → content = { items:[{medication,dose,frequency,duration}], instructions }
 *  - type 'dx': diagnóstico frecuente → content = { cie10_code, cie10_desc, assessment, plan }
 */

router.get("/", ah(async (req, res) => {
  const type = ["rx", "dx"].includes(req.query.type) ? req.query.type : null;
  const r = type
    ? await q("SELECT * FROM templates WHERE clinic_id=$1 AND type=$2 ORDER BY name ASC LIMIT 100", [req.user.clinicId, type])
    : await q("SELECT * FROM templates WHERE clinic_id=$1 ORDER BY type, name ASC LIMIT 200", [req.user.clinicId]);
  res.json(r.rows);
}));

router.post("/", requireRole("provider", "admin"), ah(async (req, res) => {
  const type = ["rx", "dx"].includes(req.body?.type) ? req.body.type : null;
  const name = s(req.body?.name, 120);
  const content = req.body?.content;
  if (!type || !name || typeof content !== "object" || content === null)
    return res.status(400).json({ error: "missing_fields" });

  // sanitizar contenido según tipo
  let clean = {};
  if (type === "rx") {
    const items = Array.isArray(content.items) ? content.items.slice(0, 30) : [];
    clean = {
      items: items
        .map((it) => ({
          medication: s(it?.medication, 200),
          dose: s(it?.dose, 100),
          frequency: s(it?.frequency, 100),
          duration: s(it?.duration, 100),
        }))
        .filter((it) => it.medication),
      instructions: s(content.instructions, 3000),
    };
    if (!clean.items.length) return res.status(400).json({ error: "empty_template" });
  } else {
    clean = {
      cie10_code: s(content.cie10_code, 10),
      cie10_desc: s(content.cie10_desc, 200),
      assessment: s(content.assessment, 5000),
      plan: s(content.plan, 5000),
    };
  }

  const r = await q(
    "INSERT INTO templates(clinic_id, type, name, content) VALUES($1,$2,$3,$4) RETURNING *",
    [req.user.clinicId, type, name, JSON.stringify(clean)]
  );
  res.status(201).json(r.rows[0]);
}));

router.delete("/:id", uuidParams("id"), requireRole("provider", "admin"), ah(async (req, res) => {
  const r = await q("DELETE FROM templates WHERE id=$1 AND clinic_id=$2 RETURNING id", [req.params.id, req.user.clinicId]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
}));

export default router;
