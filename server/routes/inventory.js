import express from "express";
import { q } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, uuidParams, s, num, isoDate } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

/*
 * Inventario del consultorio: medicamentos, insumos y otros.
 * stock/min_stock permiten alertas; expiry_date para vencimientos.
 */

// Listado (opcional ?search=)
router.get("/", ah(async (req, res) => {
  const search = s(req.query.search, 100);
  const r = search
    ? await q(
        `SELECT * FROM inventory_items WHERE clinic_id=$1 AND name ILIKE $2 ORDER BY name ASC LIMIT 300`,
        [req.user.clinicId, `%${search}%`]
      )
    : await q("SELECT * FROM inventory_items WHERE clinic_id=$1 ORDER BY name ASC LIMIT 300", [req.user.clinicId]);
  res.json(r.rows);
}));

// Alertas: stock bajo o vence en los próximos 60 días (para el dashboard)
router.get("/alerts", ah(async (req, res) => {
  const r = await q(
    `SELECT id, name, stock, min_stock, unit, expiry_date,
            (stock <= min_stock) AS low_stock,
            (expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + interval '60 days') AS expiring
     FROM inventory_items
     WHERE clinic_id=$1
       AND (stock <= min_stock
            OR (expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + interval '60 days'))
     ORDER BY expiry_date NULLS LAST, name ASC LIMIT 30`,
    [req.user.clinicId]
  );
  res.json(r.rows);
}));

function parseItem(body = {}) {
  return {
    name: s(body.name, 160),
    category: ["med", "supply", "other"].includes(body.category) ? body.category : "med",
    unit: s(body.unit, 40),
    stock: num(body.stock, 0, 1000000),
    min_stock: num(body.min_stock, 0, 1000000),
    expiry_date: isoDate(body.expiry_date),
    notes: s(body.notes, 500),
  };
}

// Crear ítem
router.post("/", ah(async (req, res) => {
  const it = parseItem(req.body);
  if (!it.name) return res.status(400).json({ error: "missing_name" });
  const r = await q(
    `INSERT INTO inventory_items(clinic_id, name, category, unit, stock, min_stock, expiry_date, notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.clinicId, it.name, it.category, it.unit, it.stock ?? 0, it.min_stock ?? 0, it.expiry_date, it.notes]
  );
  res.status(201).json(r.rows[0]);
}));

// Editar ítem
router.put("/:id", uuidParams("id"), ah(async (req, res) => {
  const it = parseItem(req.body);
  if (!it.name) return res.status(400).json({ error: "missing_name" });
  const r = await q(
    `UPDATE inventory_items
     SET name=$3, category=$4, unit=$5, stock=$6, min_stock=$7, expiry_date=$8, notes=$9
     WHERE id=$1 AND clinic_id=$2 RETURNING *`,
    [req.params.id, req.user.clinicId, it.name, it.category, it.unit, it.stock ?? 0, it.min_stock ?? 0, it.expiry_date, it.notes]
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

// Ajustar stock: {delta: +5 | -2}
router.post("/:id/adjust", uuidParams("id"), ah(async (req, res) => {
  const delta = num(req.body?.delta, -1000000, 1000000);
  if (delta === null || delta === 0) return res.status(400).json({ error: "invalid_delta" });
  const r = await q(
    `UPDATE inventory_items SET stock = GREATEST(stock + $3, 0)
     WHERE id=$1 AND clinic_id=$2 RETURNING *`,
    [req.params.id, req.user.clinicId, delta]
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

// Eliminar ítem (solo admin)
router.delete("/:id", uuidParams("id"), requireRole("admin"), ah(async (req, res) => {
  const r = await q("DELETE FROM inventory_items WHERE id=$1 AND clinic_id=$2 RETURNING id", [req.params.id, req.user.clinicId]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
}));

export default router;
