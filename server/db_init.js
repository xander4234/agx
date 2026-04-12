import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

import { q, pool } from "./db.js";
import { hashPassword } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // 1) schema
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await q(sql);

  // 2) seed: clinic + admin (idempotent)
  const clinicName = "AGX Clinic Demo";
  const clinic = await q("SELECT id FROM clinics WHERE name=$1 LIMIT 1", [clinicName]);
  let clinicId = clinic.rows[0]?.id;

  if (!clinicId) {
    const created = await q("INSERT INTO clinics(name) VALUES($1) RETURNING id", [clinicName]);
    clinicId = created.rows[0].id;
  }

  const email = "admin@agx.local";
  const existing = await q("SELECT id FROM users WHERE clinic_id=$1 AND email=$2", [clinicId, email]);
  if (!existing.rows.length) {
    const ph = await hashPassword("Admin123!");
    await q(
      "INSERT INTO users(clinic_id, full_name, email, password_hash, role) VALUES($1,$2,$3,$4,$5)",
      [clinicId, "Admin AGX", email, ph, "admin"]
    );
  }

  // 3) seed a patient + appointment if none
  const pat = await q("SELECT id FROM patients WHERE clinic_id=$1 LIMIT 1", [clinicId]);
  if (!pat.rows.length) {
    const p = await q(
      "INSERT INTO patients(clinic_id, first_name, last_name, phone, email, allergies, conditions) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [clinicId, "Juan", "Pérez", "+593900000000", "juan@example.com", "Ninguna", "Ninguna"]
    );
    const patientId = p.rows[0].id;

    const now = new Date();
    const starts = new Date(now.getTime() + 30 * 60 * 1000);
    const ends = new Date(starts.getTime() + 30 * 60 * 1000);
    await q(
      "INSERT INTO appointments(clinic_id, patient_id, provider_id, type, status, reason, starts_at, ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [clinicId, patientId, null, "in_person", "scheduled", "Consulta general (demo)", starts.toISOString(), ends.toISOString()]
    );
  }

  console.log("DB initialized ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
