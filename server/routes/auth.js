import express from "express";
import { q, pool } from "../db.js";
import { hashPassword, verifyPassword, signToken, ah, isEmail, s } from "../utils.js";

const router = express.Router();

/**
 * Registrar clínica + admin.
 */
router.post("/register", ah(async (req, res) => {
  const clinicName = s(req.body?.clinicName, 120);
  const fullName = s(req.body?.fullName, 120);
  const email = s(req.body?.email, 254)?.toLowerCase();
  const password = req.body?.password;

  if (!clinicName || !fullName || !email || !password) return res.status(400).json({ error: "missing_fields" });
  if (!isEmail(email)) return res.status(400).json({ error: "invalid_email" });
  if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "weak_password" });

  // Email único global (el login busca solo por email)
  const dup = await q("SELECT 1 FROM users WHERE email=$1 LIMIT 1", [email]);
  if (dup.rows[0]) return res.status(409).json({ error: "email_in_use" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const createdClinic = await client.query("INSERT INTO clinics(name) VALUES($1) RETURNING id", [clinicName]);
    const clinicId = createdClinic.rows[0].id;

    const ph = await hashPassword(password);
    const createdUser = await client.query(
      "INSERT INTO users(clinic_id, full_name, email, password_hash, role) VALUES($1,$2,$3,$4,'admin') RETURNING id, full_name, role",
      [clinicId, fullName, email, ph]
    );
    await client.query("COMMIT");

    const u = createdUser.rows[0];
    const token = signToken({ userId: u.id, clinicId, role: "admin", name: u.full_name });
    res.status(201).json({ token, user: { id: u.id, clinicId, name: u.full_name, role: "admin" } });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}));

router.post("/login", ah(async (req, res) => {
  const email = s(req.body?.email, 254)?.toLowerCase();
  const password = req.body?.password;
  if (!email || !password) return res.status(400).json({ error: "missing_fields" });

  const r = await q(
    "SELECT id, clinic_id, full_name, role, password_hash FROM users WHERE email=$1 LIMIT 1",
    [email]
  );
  const user = r.rows[0];
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const token = signToken({ userId: user.id, clinicId: user.clinic_id, role: user.role, name: user.full_name });
  res.json({ token, user: { id: user.id, clinicId: user.clinic_id, name: user.full_name, role: user.role } });
}));

export default router;
