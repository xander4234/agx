import express from "express";
import { q, pool } from "../db.js";
import { hashPassword, verifyPassword, signToken, ah, isEmail, s } from "../utils.js";

const router = express.Router();

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
