import express from "express";
import { q } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, uuidParams, s, isEmail, hashPassword } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

// Datos de MI consultorio
router.get("/", ah(async (req, res) => {
  const r = await q("SELECT id, name, address, phone, created_at FROM clinics WHERE id=$1", [req.user.clinicId]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

// Editar MI consultorio (nombre, dirección, teléfono) — solo admin
router.put("/", requireRole("admin"), ah(async (req, res) => {
  const name = s(req.body?.name, 120);
  const address = s(req.body?.address, 200);
  const phone = s(req.body?.phone, 40);
  if (!name || name.length < 3) return res.status(400).json({ error: "invalid_name" });
  const r = await q(
    "UPDATE clinics SET name=$1, address=$2, phone=$3 WHERE id=$4 RETURNING id, name, address, phone",
    [name, address, phone, req.user.clinicId]
  );
  res.json(r.rows[0]);
}));

/* ================= auditoría de accesos ================= */

// Últimos 150 eventos del consultorio — solo admin
router.get("/audit", requireRole("admin"), ah(async (req, res) => {
  const r = await q(
    `SELECT user_name, method, path, ip, created_at
     FROM audit_log WHERE clinic_id=$1
     ORDER BY created_at DESC LIMIT 150`,
    [req.user.clinicId]
  );
  res.json(r.rows);
}));

/* ================= usuarios del consultorio ================= */

// Listar usuarios de MI consultorio — solo admin
router.get("/users", requireRole("admin"), ah(async (req, res) => {
  const r = await q(
    "SELECT id, full_name, email, role, created_at FROM users WHERE clinic_id=$1 ORDER BY created_at ASC",
    [req.user.clinicId]
  );
  res.json(r.rows);
}));

// Crear usuario en MI consultorio — solo admin
router.post("/users", requireRole("admin"), ah(async (req, res) => {
  const fullName = s(req.body?.full_name, 120);
  const email = s(req.body?.email, 254)?.toLowerCase();
  const password = req.body?.password;
  const role = ["admin", "provider", "staff"].includes(req.body?.role) ? req.body.role : "staff";

  if (!fullName || !email || !password) return res.status(400).json({ error: "missing_fields" });
  if (!isEmail(email)) return res.status(400).json({ error: "invalid_email" });
  if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "weak_password" });

  // email único global (el login busca solo por email)
  const dup = await q("SELECT 1 FROM users WHERE email=$1 LIMIT 1", [email]);
  if (dup.rows[0]) return res.status(409).json({ error: "email_in_use" });

  const ph = await hashPassword(password);
  const r = await q(
    "INSERT INTO users(clinic_id, full_name, email, password_hash, role) VALUES($1,$2,$3,$4,$5) RETURNING id, full_name, email, role, created_at",
    [req.user.clinicId, fullName, email, ph, role]
  );
  res.status(201).json(r.rows[0]);
}));

// Eliminar usuario de MI consultorio — solo admin, no puede eliminarse a sí mismo
router.delete("/users/:id", uuidParams("id"), requireRole("admin"), ah(async (req, res) => {
  if (req.params.id === req.user.userId) return res.status(400).json({ error: "cannot_delete_self" });
  const r = await q(
    "DELETE FROM users WHERE id=$1 AND clinic_id=$2 RETURNING id",
    [req.params.id, req.user.clinicId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
}));

export default router;
