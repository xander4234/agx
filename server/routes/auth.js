import express from "express";
import { q } from "../db.js";
import { hashPassword, verifyPassword, signToken } from "../utils.js";

const router = express.Router();

/**
 * Register clinic + admin (MVP)
 * In producción: limitar registro y validar email.
 */
router.post("/register", async (req, res) => {
  const { clinicName, fullName, email, password } = req.body || {};
  if (!clinicName || !fullName || !email || !password) return res.status(400).json({ error: "missing_fields" });

  const createdClinic = await q("INSERT INTO clinics(name) VALUES($1) RETURNING id", [clinicName]);
  const clinicId = createdClinic.rows[0].id;

  const ph = await hashPassword(password);
  const createdUser = await q(
    "INSERT INTO users(clinic_id, full_name, email, password_hash, role) VALUES($1,$2,$3,$4,'admin') RETURNING id, full_name, role",
    [clinicId, fullName, email.toLowerCase(), ph]
  );

  const token = signToken({ userId: createdUser.rows[0].id, clinicId, role: "admin", name: createdUser.rows[0].full_name });
  res.json({ token });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "missing_fields" });

  const r = await q(
    "SELECT id, clinic_id, full_name, role, password_hash FROM users WHERE email=$1 LIMIT 1",
    [email.toLowerCase()]
  );
  const user = r.rows[0];
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const token = signToken({ userId: user.id, clinicId: user.clinic_id, role: user.role, name: user.full_name });
  res.json({ token, user: { id: user.id, clinicId: user.clinic_id, name: user.full_name, role: user.role } });
});

export default router;
