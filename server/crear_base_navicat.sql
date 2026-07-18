-- ============================================================
-- AGX Salud — Script completo para crear la base en Navicat
-- Ejecutar CONECTADO a la base de datos "agx_health"
-- Crea todas las tablas + usuario admin (admin@agx.local / Admin123!)
-- Es idempotente: puedes ejecutarlo varias veces sin problema
-- ============================================================

-- Extensiones útiles
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Clínicas (multi-tenant)
CREATE TABLE IF NOT EXISTS clinics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usuarios (admin / staff / provider)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','staff','provider')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, email)
);

-- Pacientes
CREATE TABLE IF NOT EXISTS patients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  id_number     TEXT,
  phone         TEXT,
  email         TEXT,
  birth_date    DATE,
  sex           TEXT CHECK (sex IN ('male','female','other')),
  allergies     TEXT,
  conditions    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Citas (atención inmediata = status waiting)
CREATE TABLE IF NOT EXISTS appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('in_person','virtual')),
  status          TEXT NOT NULL CHECK (status IN ('scheduled','confirmed','waiting','in_progress','done','canceled')),
  reason          TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notas clínicas SOAP (una por cita)
CREATE TABLE IF NOT EXISTS encounters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  subjective      TEXT,
  objective       TEXT,
  assessment      TEXT,
  plan            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id)
);

-- Signos vitales
CREATE TABLE IF NOT EXISTS vitals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  taken_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  systolic      INT,
  diastolic     INT,
  heart_rate    INT,
  spo2          INT,
  temperature_c NUMERIC(4,1),
  weight_kg     NUMERIC(6,2),
  glucose_mgdl  INT,
  notes         TEXT
);

-- Recetas
CREATE TABLE IF NOT EXISTS prescriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  provider_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  instructions  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medication      TEXT NOT NULL,
  dose            TEXT,
  frequency       TEXT,
  duration        TEXT,
  notes           TEXT
);

-- Chat por cita
CREATE TABLE IF NOT EXISTS chat_threads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_name TEXT,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recordatorios (para futuras notificaciones)
CREATE TABLE IF NOT EXISTS reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  details       TEXT,
  schedule_cron TEXT,
  next_run_at   TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Archivos adjuntos (exámenes, laboratorio, imágenes)
CREATE TABLE IF NOT EXISTS attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  file_name      TEXT NOT NULL,
  original_name  TEXT NOT NULL,
  mime           TEXT,
  size_bytes     BIGINT,
  category       TEXT NOT NULL DEFAULT 'exam',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SEED: clínica demo + usuario admin
-- Login: admin@agx.local / Admin123!
-- ============================================================
INSERT INTO clinics(name)
SELECT 'AGX Clinic Demo'
WHERE NOT EXISTS (SELECT 1 FROM clinics WHERE name = 'AGX Clinic Demo');

INSERT INTO users(clinic_id, full_name, email, password_hash, role)
SELECT c.id, 'Admin AGX', 'admin@agx.local',
       '$2a$10$dmN1LTkmONG9Lh65JKL13Om/4S2JEzbMGEmOmXuxT3ZbJdIVqI4ru',
       'admin'
FROM clinics c
WHERE c.name = 'AGX Clinic Demo'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@agx.local');

-- Verificación
SELECT 'Tablas creadas ✅' AS resultado;
SELECT email, role FROM users;
