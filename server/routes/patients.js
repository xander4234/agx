import express from "express";
import PDFDocument from "pdfkit";
import { q } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, uuidParams, s, int, isoDate, isEmail } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

// Listado con búsqueda y paginación: /api/patients?search=juan&limit=50&offset=0
router.get("/", ah(async (req, res) => {
  const limit = int(req.query.limit, 1, 200) ?? 50;
  const offset = int(req.query.offset, 0, 100000) ?? 0;
  const search = s(req.query.search, 100);

  let rows;
  if (search) {
    rows = await q(
      `SELECT * FROM patients
       WHERE clinic_id=$1
         AND (first_name ILIKE $2 OR last_name ILIKE $2 OR id_number ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [req.user.clinicId, `%${search}%`, limit, offset]
    );
  } else {
    rows = await q(
      "SELECT * FROM patients WHERE clinic_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [req.user.clinicId, limit, offset]
    );
  }
  res.json(rows.rows);
}));

function parsePatientBody(body = {}) {
  const email = s(body.email, 254);
  return {
    first_name: s(body.first_name, 80),
    last_name: s(body.last_name, 80),
    id_number: s(body.id_number, 40),
    phone: s(body.phone, 40),
    email: email && isEmail(email) ? email.toLowerCase() : null,
    birth_date: isoDate(body.birth_date),
    sex: ["male", "female", "other"].includes(body.sex) ? body.sex : null,
    allergies: s(body.allergies, 1000),
    conditions: s(body.conditions, 1000),
    notes: s(body.notes, 2000),
    family_history: s(body.family_history, 2000),
    surgical_history: s(body.surgical_history, 2000),
    habits: s(body.habits, 2000),
    medications: s(body.medications, 2000),
  };
}

router.post("/", ah(async (req, res) => {
  const p = parsePatientBody(req.body);
  if (!p.first_name || !p.last_name) return res.status(400).json({ error: "missing_name" });

  const r = await q(
    `INSERT INTO patients(
      clinic_id, first_name, last_name, id_number, phone, email, birth_date, sex,
      allergies, conditions, notes, family_history, surgical_history, habits, medications
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [req.user.clinicId, p.first_name, p.last_name, p.id_number, p.phone, p.email,
     p.birth_date, p.sex, p.allergies, p.conditions, p.notes,
     p.family_history, p.surgical_history, p.habits, p.medications]
  );
  res.status(201).json(r.rows[0]);
}));

router.get("/:id", uuidParams("id"), ah(async (req, res) => {
  const r = await q("SELECT * FROM patients WHERE id=$1 AND clinic_id=$2", [req.params.id, req.user.clinicId]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

router.put("/:id", uuidParams("id"), ah(async (req, res) => {
  const allowed = ["first_name","last_name","id_number","phone","email","birth_date","sex",
    "allergies","conditions","notes","family_history","surgical_history","habits","medications"];
  const parsed = parsePatientBody(req.body);
  const updates = [];
  const values = [req.params.id, req.user.clinicId];
  let idx = 3;

  for (const f of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, f)) {
      updates.push(`${f}=$${idx++}`);
      values.push(parsed[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "no_updates" });

  const r = await q(
    `UPDATE patients SET ${updates.join(", ")} WHERE id=$1 AND clinic_id=$2 RETURNING *`,
    values
  );
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(r.rows[0]);
}));

// Solo admin puede eliminar (borra en cascada citas, signos, recetas del paciente)
router.delete("/:id", uuidParams("id"), requireRole("admin"), ah(async (req, res) => {
  const r = await q("DELETE FROM patients WHERE id=$1 AND clinic_id=$2 RETURNING id", [req.params.id, req.user.clinicId]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
}));

/* ============================================================
   PDF de historia clínica completa del paciente
   (derecho del paciente según normativa ecuatoriana)
   ============================================================ */
router.get("/:id/historia.pdf", uuidParams("id"), ah(async (req, res) => {
  const pr = await q(
    `SELECT p.*, c.name AS clinic_name FROM patients p
     JOIN clinics c ON c.id=p.clinic_id
     WHERE p.id=$1 AND p.clinic_id=$2`,
    [req.params.id, req.user.clinicId]
  );
  const p = pr.rows[0];
  if (!p) return res.status(404).json({ error: "not_found" });

  const [encounters, vitals, rx, certs] = await Promise.all([
    q(`SELECT e.*, a.starts_at, a.reason, u.full_name AS provider_name
       FROM encounters e
       JOIN appointments a ON a.id=e.appointment_id
       LEFT JOIN users u ON u.id=a.provider_id
       WHERE e.clinic_id=$1 AND a.patient_id=$2
       ORDER BY a.starts_at DESC LIMIT 50`, [req.user.clinicId, p.id]),
    q(`SELECT * FROM vitals WHERE clinic_id=$1 AND patient_id=$2 ORDER BY taken_at DESC LIMIT 20`,
      [req.user.clinicId, p.id]),
    q(`SELECT pr.created_at, pr.instructions,
              (SELECT string_agg(medication || COALESCE(' ' || dose, ''), '; ') FROM prescription_items pi WHERE pi.prescription_id=pr.id) AS meds
       FROM prescriptions pr WHERE pr.clinic_id=$1 AND pr.patient_id=$2
       ORDER BY pr.created_at DESC LIMIT 30`, [req.user.clinicId, p.id]),
    q(`SELECT created_at, diagnosis, rest_days FROM certificates
       WHERE clinic_id=$1 AND patient_id=$2 ORDER BY created_at DESC LIMIT 20`,
      [req.user.clinicId, p.id]).catch(() => ({ rows: [] })),
  ]);

  const NAVY = "#0B1F3B", TEAL = "#0d9488", GRAY = "#64748b", BORDER = "#cbd5e1";
  const edad = (() => {
    if (!p.birth_date) return "—";
    const b = new Date(p.birth_date), now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
    return `${a} años`;
  })();
  const sexo = { male: "Masculino", female: "Femenino", other: "Otro" }[p.sex] || "—";
  const hoy = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="historia-${(p.last_name || "paciente").toLowerCase()}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margins: { top: 60, bottom: 60, left: 46, right: 46 } });
  doc.pipe(res);
  const W = doc.page.width, M = 46, CW = W - M * 2;

  // Cabecera solo en la primera página
  doc.rect(0, 0, W, 84).fill(NAVY);
  doc.rect(0, 84, W, 4).fill(TEAL);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(19).text(p.clinic_name || "AGX Salud", M, 20, { width: CW * 0.6 });
  doc.font("Helvetica").fontSize(9).fillColor("#c7e8e3").text("Historia clínica — documento confidencial", M, 46);
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff").text("HISTORIA CLÍNICA", M, 22, { width: CW, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor("#c7e8e3").text(`Generada: ${hoy}`, M, 42, { width: CW, align: "right" });
  doc.y = 106;

  const section = (title) => {
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(TEAL).text(title, M, doc.y);
    doc.moveTo(M, doc.y + 2).lineTo(M + CW, doc.y + 2).lineWidth(0.6).strokeColor(BORDER).stroke();
    doc.moveDown(0.4);
  };
  const kv = (label, value) => {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY).text(label.toUpperCase() + ": ", { continued: true });
    doc.font("Helvetica").fontSize(9.5).fillColor("#0F172A").text(value || "—");
  };

  // Datos personales
  section("DATOS DEL PACIENTE");
  kv("Nombres", `${p.first_name} ${p.last_name}`);
  kv("Cédula / ID", p.id_number);
  kv("Nacimiento", p.birth_date ? new Date(p.birth_date).toLocaleDateString("es-EC") + ` (${edad})` : "—");
  kv("Sexo", sexo);
  kv("Teléfono", p.phone);
  kv("Email", p.email);

  // Antecedentes
  section("ANTECEDENTES");
  kv("Alergias", p.allergies);
  kv("Condiciones / patológicos personales", p.conditions);
  kv("Antecedentes familiares", p.family_history);
  kv("Antecedentes quirúrgicos", p.surgical_history);
  kv("Hábitos", p.habits);
  kv("Medicación habitual", p.medications);
  if (p.notes) kv("Notas", p.notes);

  // Consultas
  section(`CONSULTAS REGISTRADAS (${encounters.rows.length})`);
  if (!encounters.rows.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(GRAY).text("Sin consultas registradas.");
  }
  for (const e of encounters.rows) {
    if (doc.y > doc.page.height - 160) doc.addPage();
    const f = new Date(e.starts_at).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY)
      .text(`${f} — ${e.reason || "Consulta"}${e.provider_name ? ` · ${e.provider_name}` : ""}`);
    if (e.cie10_code || e.cie10_desc) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(TEAL)
        .text(`Dx CIE-10: ${e.cie10_code || ""} ${e.cie10_desc || ""}`.trim());
    }
    const soap = [["S", e.subjective], ["O", e.objective], ["A", e.assessment], ["P", e.plan]];
    for (const [k, v] of soap) {
      if (!v) continue;
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(GRAY).text(`${k}: `, { continued: true });
      doc.font("Helvetica").fontSize(9).fillColor("#0F172A").text(v);
    }
    doc.moveDown(0.5);
  }

  // Signos vitales
  section(`SIGNOS VITALES (últimos ${vitals.rows.length})`);
  if (!vitals.rows.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(GRAY).text("Sin registros.");
  } else {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(GRAY)
      .text("Fecha          PA         FC     SpO2    T°      Peso     Glucosa");
    doc.font("Helvetica").fontSize(9).fillColor("#0F172A");
    for (const v of vitals.rows) {
      const f = new Date(v.taken_at).toLocaleDateString("es-EC");
      const pa = `${v.systolic ?? "—"}/${v.diastolic ?? "—"}`;
      doc.text(`${f.padEnd(14)} ${pa.padEnd(10)} ${String(v.heart_rate ?? "—").padEnd(6)} ${String(v.spo2 ?? "—").padEnd(7)} ${String(v.temperature_c ?? "—").padEnd(7)} ${String(v.weight_kg ?? "—").padEnd(8)} ${v.glucose_mgdl ?? "—"}`);
    }
  }

  // Recetas
  section(`RECETAS EMITIDAS (${rx.rows.length})`);
  if (!rx.rows.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(GRAY).text("Sin recetas.");
  }
  for (const r2 of rx.rows) {
    if (doc.y > doc.page.height - 100) doc.addPage();
    const f = new Date(r2.created_at).toLocaleDateString("es-EC");
    doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY).text(`${f}: `, { continued: true });
    doc.font("Helvetica").fontSize(9).fillColor("#0F172A").text(r2.meds || "—");
  }

  // Certificados
  if (certs.rows.length) {
    section(`CERTIFICADOS MÉDICOS (${certs.rows.length})`);
    for (const c2 of certs.rows) {
      const f = new Date(c2.created_at).toLocaleDateString("es-EC");
      doc.font("Helvetica").fontSize(9).fillColor("#0F172A")
        .text(`${f} — ${c2.diagnosis || "Constancia"}${c2.rest_days ? ` · ${c2.rest_days} día(s) de reposo` : ""}`);
    }
  }

  // Pie
  doc.moveDown(1.2);
  doc.font("Helvetica").fontSize(7.5).fillColor(GRAY).text(
    "Documento confidencial protegido por la Ley Orgánica de Protección de Datos Personales del Ecuador. " +
    "Uso exclusivo del paciente y del personal de salud autorizado.",
    M, doc.y, { width: CW, align: "center" }
  );

  doc.end();
}));

export default router;
