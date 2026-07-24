import { q } from "./db.js";

/*
 * Migraciones automáticas e idempotentes.
 * Se ejecutan una sola vez por proceso, en la primera petición a /api.
 * Permiten actualizar instalaciones existentes sin tocar la base a mano.
 */
let upgradePromise = null;

export function ensureUpgrades() {
  if (!upgradePromise) {
    upgradePromise = run().catch((e) => {
      upgradePromise = null; // reintenta en la siguiente petición
      throw e;
    });
  }
  return upgradePromise;
}

async function run() {
  // ---- Antecedentes completos del paciente (formato historia clínica MSP) ----
  await q(`ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS family_history   TEXT,
    ADD COLUMN IF NOT EXISTS surgical_history TEXT,
    ADD COLUMN IF NOT EXISTS habits           TEXT,
    ADD COLUMN IF NOT EXISTS medications      TEXT`);

  // ---- Diagnóstico codificado CIE-10 en la nota clínica ----
  await q(`ALTER TABLE encounters
    ADD COLUMN IF NOT EXISTS cie10_code TEXT,
    ADD COLUMN IF NOT EXISTS cie10_desc TEXT`);

  // ---- Estado de cita "no asistió" (para estadística de ausentismo) ----
  await q(`ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check`);
  await q(`ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
    CHECK (status IN ('scheduled','confirmed','waiting','in_progress','done','canceled','no_show'))`);

  // ---- Certificados (la crea aquí para que exista desde el inicio) ----
  await q(`CREATE TABLE IF NOT EXISTS certificates (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id      UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    diagnosis      TEXT,
    rest_days      INT,
    observations   TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ---- Plantillas rápidas (recetas y diagnósticos frecuentes) ----
  await q(`CREATE TABLE IF NOT EXISTS templates (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id  UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (type IN ('rx','dx')),
    name       TEXT NOT NULL,
    content    JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ---- Caja: cobros por consulta ----
  await q(`CREATE TABLE IF NOT EXISTS payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id      UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    amount         NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    method         TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','card','transfer','other')),
    status         TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','pending')),
    concept        TEXT,
    created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ---- Inventario de medicamentos e insumos ----
  await q(`CREATE TABLE IF NOT EXISTS inventory_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'med' CHECK (category IN ('med','supply','other')),
    unit        TEXT,
    stock       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (stock >= 0),
    min_stock   NUMERIC(10,2) NOT NULL DEFAULT 0,
    expiry_date DATE,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ---- Auditoría de accesos (Ley Orgánica de Protección de Datos Personales) ----
  await q(`CREATE TABLE IF NOT EXISTS audit_log (
    id         BIGSERIAL PRIMARY KEY,
    clinic_id  UUID,
    user_id    UUID,
    user_name  TEXT,
    method     TEXT,
    path       TEXT,
    ip         TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // ---- Índices para que vuele aunque haya miles de registros ----
  await q(`CREATE INDEX IF NOT EXISTS idx_patients_clinic      ON patients(clinic_id, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_appts_clinic_starts  ON appointments(clinic_id, starts_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_appts_patient        ON appointments(patient_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_vitals_patient_taken ON vitals(patient_id, taken_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_rx_clinic            ON prescriptions(clinic_id, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_attach_patient       ON attachments(patient_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_chatmsg_thread       ON chat_messages(thread_id, created_at)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_payments_clinic      ON payments(clinic_id, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_audit_clinic         ON audit_log(clinic_id, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_enc_appt             ON encounters(appointment_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_inventory_clinic     ON inventory_items(clinic_id, name)`);

  console.log("Migraciones automáticas aplicadas ✅");
}

/*
 * Auditoría: registra operaciones sensibles sin bloquear la respuesta.
 * Se registran: todas las escrituras (POST/PUT/DELETE) y las lecturas de
 * datos clínicos individuales (ficha, PDFs, descargas de exámenes).
 */
const SENSITIVE_GET = /^\/(patients|files|prescriptions|certificates|encounters)\/[0-9a-f-]{8}/i;

export function auditMiddleware(req, res, next) {
  res.on("finish", () => {
    try {
      if (!req.user || res.statusCode >= 400) return;
      const p = req.path || "";
      const isWrite = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);
      const isSensitiveRead = req.method === "GET" && SENSITIVE_GET.test(p);
      if (!isWrite && !isSensitiveRead) return;
      if (p.startsWith("/auth")) return;

      q(
        `INSERT INTO audit_log(clinic_id, user_id, user_name, method, path, ip)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          req.user.clinicId || null,
          req.user.userId || null,
          String(req.user.name || "").slice(0, 120),
          req.method,
          p.slice(0, 300),
          String(req.ip || "").slice(0, 60),
        ]
      ).catch(() => {});
    } catch {}
  });
  next();
}
