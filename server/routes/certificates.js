import express from "express";
import PDFDocument from "pdfkit";
import { q } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, uuidParams, isUuid, s, int } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

// Crea la tabla si no existe (mini-migración automática)
let ensured = false;
async function ensureTable() {
  if (ensured) return;
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
  ensured = true;
}

// Listar certificados (opcional ?patient_id=)
router.get("/", ah(async (req, res) => {
  await ensureTable();
  const { patient_id } = req.query;
  if (patient_id && !isUuid(patient_id)) return res.status(400).json({ error: "invalid_patient" });

  const r = patient_id
    ? await q(
        `SELECT ce.*, p.first_name, p.last_name FROM certificates ce
         JOIN patients p ON p.id=ce.patient_id
         WHERE ce.clinic_id=$1 AND ce.patient_id=$2 ORDER BY ce.created_at DESC LIMIT 100`,
        [req.user.clinicId, patient_id]
      )
    : await q(
        `SELECT ce.*, p.first_name, p.last_name FROM certificates ce
         JOIN patients p ON p.id=ce.patient_id
         WHERE ce.clinic_id=$1 ORDER BY ce.created_at DESC LIMIT 100`,
        [req.user.clinicId]
      );
  res.json(r.rows);
}));

// Emitir certificado — solo provider/admin
router.post("/", requireRole("provider", "admin"), ah(async (req, res) => {
  await ensureTable();
  const { appointment_id } = req.body || {};
  const restDays = int(req.body?.rest_days, 0, 365);
  const observations = s(req.body?.observations, 2000);
  let diagnosis = s(req.body?.diagnosis, 2000);

  if (!isUuid(appointment_id)) return res.status(400).json({ error: "missing_appointment" });

  const appt = await q(
    "SELECT id, patient_id FROM appointments WHERE id=$1 AND clinic_id=$2",
    [appointment_id, req.user.clinicId]
  );
  if (!appt.rows[0]) return res.status(400).json({ error: "invalid_appointment" });

  // Si no envían diagnóstico, usar el de la nota SOAP de la cita
  if (!diagnosis) {
    const enc = await q("SELECT assessment FROM encounters WHERE appointment_id=$1", [appointment_id]);
    diagnosis = enc.rows[0]?.assessment || null;
  }

  const r = await q(
    `INSERT INTO certificates(clinic_id, appointment_id, patient_id, provider_id, diagnosis, rest_days, observations)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.clinicId, appointment_id, appt.rows[0].patient_id, req.user.userId, diagnosis, restDays, observations]
  );
  res.status(201).json(r.rows[0]);
}));

/* ============================================================
   PDF de certificado médico — formato tipo MSP Ecuador
   ============================================================ */
router.get("/:id/pdf", uuidParams("id"), ah(async (req, res) => {
  await ensureTable();
  const r = await q(
    `SELECT ce.*, p.first_name, p.last_name, p.id_number, p.birth_date, p.sex,
            u.full_name AS provider_name, c.name AS clinic_name,
            a.starts_at AS attended_at
     FROM certificates ce
     JOIN patients p ON p.id=ce.patient_id
     LEFT JOIN users u ON u.id=ce.provider_id
     JOIN clinics c ON c.id=ce.clinic_id
     JOIN appointments a ON a.id=ce.appointment_id
     WHERE ce.id=$1 AND ce.clinic_id=$2`,
    [req.params.id, req.user.clinicId]
  );
  const row = r.rows[0];
  if (!row) return res.status(404).json({ error: "not_found" });

  const NAVY = "#0B1F3B";
  const TEAL = "#0d9488";
  const GRAY = "#64748b";
  const LIGHT = "#f0fdfa";
  const BORDER = "#cbd5e1";

  const edad = (() => {
    if (!row.birth_date) return null;
    const b = new Date(row.birth_date);
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
    return a;
  })();
  const sexo = { male: "masculino", female: "femenino", other: "" }[row.sex] || "";
  const emitido = new Date(row.created_at);
  const fechaEmision = emitido.toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });
  const fechaAtencion = new Date(row.attended_at).toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });
  const numCert = row.id.split("-")[0].toUpperCase();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="certificado-${numCert}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 0 });
  doc.pipe(res);

  const W = doc.page.width;
  const M = 56;
  const CW = W - M * 2;

  /* Cabecera */
  doc.rect(0, 0, W, 96).fill(NAVY);
  doc.rect(0, 96, W, 4).fill(TEAL);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(21).text(row.clinic_name || "AGX Salud", M, 24, { width: CW * 0.6 });
  doc.font("Helvetica").fontSize(9.5).fillColor("#c7e8e3").text("Sistema de gestión médica AGX Salud", M, 52);
  doc.text("Ecuador", M, 65);
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#ffffff")
     .text("CERTIFICADO MÉDICO", M, 26, { width: CW, align: "right" });
  doc.font("Helvetica").fontSize(9.5).fillColor("#c7e8e3")
     .text(`Certificado No. ${numCert}`, M, 48, { width: CW, align: "right" })
     .text(`Emitido: ${fechaEmision}`, M, 61, { width: CW, align: "right" });

  /* Cuerpo */
  let y = 150;
  doc.font("Helvetica-Bold").fontSize(16).fillColor(NAVY)
     .text("CERTIFICADO MÉDICO", M, y, { width: CW, align: "center" });
  y += 44;

  const nombre = `${row.first_name} ${row.last_name}`.toUpperCase();
  const cedulaTxt = row.id_number ? `, portador(a) de la cédula de identidad No. ${row.id_number}` : "";
  const edadTxt = edad !== null ? `, de ${edad} años de edad` : "";
  const sexoTxt = sexo ? `, de sexo ${sexo}` : "";

  let cuerpo =
    `Yo, ${row.provider_name || "el/la profesional de salud tratante"}, en mi calidad de profesional de la salud de ${row.clinic_name || "esta casa de salud"}, ` +
    `CERTIFICO que el/la paciente ${nombre}${cedulaTxt}${edadTxt}${sexoTxt}, ` +
    `fue atendido(a) en esta casa de salud el día ${fechaAtencion}.`;

  doc.font("Helvetica").fontSize(11.5).fillColor("#0F172A")
     .text(cuerpo, M, y, { width: CW, align: "justify", lineGap: 5 });
  y = doc.y + 18;

  if (row.diagnosis) {
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(TEAL).text("DIAGNÓSTICO / MOTIVO", M, y);
    y += 15;
    const dH = Math.max(30, doc.heightOfString(row.diagnosis, { width: CW - 24 }) + 16);
    doc.roundedRect(M, y, CW, dH, 6).lineWidth(0.8).strokeColor(BORDER).stroke();
    doc.font("Helvetica").fontSize(11).fillColor("#0F172A").text(row.diagnosis, M + 12, y + 8, { width: CW - 24 });
    y += dH + 18;
  }

  if (row.rest_days && row.rest_days > 0) {
    const hasta = new Date(emitido.getTime() + row.rest_days * 86400000)
      .toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });
    doc.font("Helvetica").fontSize(11.5).fillColor("#0F172A").text(
      `Por lo expuesto, se recomienda REPOSO ${row.rest_days === 1 ? "de UN (1) día" : `de ${row.rest_days} (${numeroALetras(row.rest_days)}) días`} ` +
      `a partir del ${fechaEmision} hasta el ${hasta}, tiempo durante el cual el/la paciente no podrá realizar sus actividades habituales.`,
      M, y, { width: CW, align: "justify", lineGap: 5 }
    );
    y = doc.y + 18;
  }

  if (row.observations) {
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(TEAL).text("OBSERVACIONES", M, y);
    y += 15;
    doc.font("Helvetica").fontSize(11).fillColor("#0F172A").text(row.observations, M, y, { width: CW, align: "justify", lineGap: 4 });
    y = doc.y + 18;
  }

  doc.font("Helvetica").fontSize(11).fillColor("#0F172A").text(
    "El presente certificado se expide a petición del/de la interesado(a), para los fines que estime conveniente.",
    M, y, { width: CW, align: "justify", lineGap: 4 }
  );

  /* Firma */
  const sigY = Math.max(doc.y + 90, 620);
  const sigW = 220;
  const sigX = (W - sigW) / 2;
  doc.lineWidth(0.8).strokeColor(NAVY).moveTo(sigX, sigY).lineTo(sigX + sigW, sigY).stroke();
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(NAVY)
     .text(row.provider_name || "Profesional de la salud", sigX, sigY + 8, { width: sigW, align: "center" });
  doc.font("Helvetica").fontSize(8.5).fillColor(GRAY)
     .text("Firma y sello del profesional", sigX, sigY + 23, { width: sigW, align: "center" })
     .text("Reg. profesional (ACESS): ____________________", sigX - 20, sigY + 36, { width: sigW + 40, align: "center" });

  /* Pie */
  const footY = doc.page.height - 60;
  doc.rect(0, footY, W, 60).fill(LIGHT);
  doc.font("Helvetica").fontSize(7.5).fillColor(GRAY).text(
    "Certificado emitido conforme a la normativa del Ministerio de Salud Pública del Ecuador. " +
    "Este documento requiere firma y sello del profesional para su validez legal.",
    M, footY + 14, { width: CW, align: "center" }
  );
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(TEAL).text(
    `${row.clinic_name || "AGX Salud"} · Documento generado electrónicamente · Certificado No. ${numCert}`,
    M, footY + 38, { width: CW, align: "center" }
  );

  doc.end();
}));

// Números a letras (1-365, suficiente para días de reposo)
function numeroALetras(n) {
  const u = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ",
    "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE"];
  if (n <= 20) return u[n];
  const d = ["", "", "VEINTI", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  if (n < 30) return d[2] + (n % 10 ? u[n % 10] : "");
  if (n < 100) {
    const dec = Math.floor(n / 10), res = n % 10;
    return d[dec] + (res ? " Y " + u[res] : "");
  }
  return String(n);
}

export default router;
