import express from "express";
import { q, pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ah, uuidParams, s, isEmail, hashPassword } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

// Solo el superadministrador de la plataforma
router.use((req, res, next) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "forbidden" });
  next();
});

// Migración perezosa: permitir rol superadmin en la base
let ensured = false;
async function ensureRole() {
  if (ensured) return;
  await q("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
  await q("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin','admin','staff','provider'))");
  ensured = true;
}

// Listar todos los consultorios de la plataforma
router.get("/clinics", ah(async (req, res) => {
  await ensureRole();
  const r = await q(`
    SELECT c.id, c.name, c.created_at,
      (SELECT COUNT(*)::int FROM users u WHERE u.clinic_id = c.id) AS users_count,
      (SELECT COUNT(*)::int FROM patients p WHERE p.clinic_id = c.id) AS patients_count
    FROM clinics c
    ORDER BY c.created_at ASC`);
  res.json(r.rows);
}));

// Crear consultorio + su usuario administrador
router.post("/clinics", ah(async (req, res) => {
  await ensureRole();
  const clinicName = s(req.body?.clinicName, 120);
  const adminName = s(req.body?.adminName, 120);
  const email = s(req.body?.email, 254)?.toLowerCase();
  const password = req.body?.password;

  if (!clinicName || !adminName || !email || !password) return res.status(400).json({ error: "missing_fields" });
  if (!isEmail(email)) return res.status(400).json({ error: "invalid_email" });
  if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "weak_password" });

  const dup = await q("SELECT 1 FROM users WHERE email=$1 LIMIT 1", [email]);
  if (dup.rows[0]) return res.status(409).json({ error: "email_in_use" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await client.query("INSERT INTO clinics(name) VALUES($1) RETURNING id, name, created_at", [clinicName]);
    const clinicId = c.rows[0].id;
    const ph = await hashPassword(password);
    const u = await client.query(
      "INSERT INTO users(clinic_id, full_name, email, password_hash, role) VALUES($1,$2,$3,$4,'admin') RETURNING id, full_name, email, role",
      [clinicId, adminName, email, ph]
    );
    await client.query("COMMIT");
    res.status(201).json({ clinic: c.rows[0], admin: u.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}));

// Eliminar un consultorio completo (borra usuarios, pacientes, citas, todo en cascada)
router.delete("/clinics/:id", uuidParams("id"), ah(async (req, res) => {
  if (req.params.id === req.user.clinicId) return res.status(400).json({ error: "cannot_delete_own_clinic" });
  const r = await q("DELETE FROM clinics WHERE id=$1 RETURNING id, name", [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, deleted: r.rows[0].name });
}));

export default router;
