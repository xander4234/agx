import express from "express";
import PDFDocument from "pdfkit";
import { q, pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, uuidParams, isUuid, s } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

// Listar recetas (opcional ?patient_id=)
router.get("/", ah(async (req, res) => {
  const { patient_id } = req.query;
  if (patient_id && !isUuid(patient_id)) return res.status(400).json({ error: "invalid_patient" });

  const r = patient_id
    ? await q(
        `SELECT pr.*, p.first_name, p.last_name FROM prescriptions pr
         JOIN patients p ON p.id=pr.patient_id
         WHERE pr.clinic_id=$1 AND pr.patient_id=$2 ORDER BY pr.created_at DESC LIMIT 100`,
        [req.user.clinicId, patient_id]
      )
    : await q(
        `SELECT pr.*, p.first_name, p.last_name FROM prescriptions pr
         JOIN patients p ON p.id=pr.patient_id
         WHERE pr.clinic_id=$1 ORDER BY pr.created_at DESC LIMIT 100`,
        [req.user.clinicId]
      );
  res.json(r.rows);
}));

// Crear receta — solo provider/admin, con ítems en transacción
router.post("/", requireRole("provider", "admin"), ah(async (req, res) => {
  const { appointment_id, patient_id, provider_id, items } = req.body || {};
  const instructions = s(req.body?.instructions, 3000);

  if (!isUuid(appointment_id) || !isUuid(patient_id)) return res.status(400).json({ error: "missing_fields" });
  if (provider_id && !isUuid(provider_id)) return res.status(400).json({ error: "invalid_provider" });

  const appt = await q(
    "SELECT id FROM appointments WHERE id=$1 AND clinic_id=$2 AND patient_id=$3",
    [appointment_id, req.user.clinicId, patient_id]
  );
  if (!appt.rows[0]) return res.status(400).json({ error: "invalid_appointment" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pr = await client.query(
      `INSERT INTO prescriptions(clinic_id, appointment_id, provider_id, patient_id, instructions)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.clinicId, appointment_id, provider_id || req.user.userId, patient_id, instructions]
    );
    const prescription = pr.rows[0];

    const arr = Array.isArray(items) ? items.slice(0, 30) : [];
    const saved = [];
    for (const it of arr) {
      const medication = s(it?.medication, 200);
      if (!medication) continue;
      const ins = await client.query(
        `INSERT INTO prescription_items(prescription_id, medication, dose, frequency, duration, notes)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [prescription.id, medication, s(it?.dose, 100), s(it?.frequency, 100), s(it?.duration, 100), s(it?.notes, 500)]
      );
      saved.push(ins.rows[0]);
    }
    await client.query("COMMIT");
    res.status(201).json({ ...prescription, items: saved });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}));

// Detalle
router.get("/:id", uuidParams("id"), ah(async (req, res) => {
  const pr = await q("SELECT * FROM prescriptions WHERE id=$1 AND clinic_id=$2", [req.params.id, req.user.clinicId]);
  if (!pr.rows[0]) return res.status(404).json({ error: "not_found" });
  const items = await q("SELECT * FROM prescription_items WHERE prescription_id=$1", [req.params.id]);
  res.json({ ...pr.rows[0], items: items.rows });
}));

/* ============================================================
   PDF de receta — formato basado en la normativa de prescripción
   del Ministerio de Salud Pública del Ecuador:
   - Identificación del establecimiento y del profesional
   - Datos del paciente (nombres, cédula, edad, sexo)
   - Diagnóstico
   - Prescripción en Denominación Común Internacional (DCI)
   - Dosis, frecuencia, duración y cantidad
   - Fecha de emisión y validez (72 horas)
   - Firma y sello del profesional prescriptor
   ============================================================ */
router.get("/:id/pdf", uuidParams("id"), ah(async (req, res) => {
  const pr = await q(
    `SELECT pr.*, p.first_name, p.last_name, p.id_number, p.birth_date, p.sex, p.allergies,
            u.full_name AS provider_name, c.name AS clinic_name,
            e.assessment AS diagnosis
     FROM prescriptions pr
     JOIN patients p ON p.id=pr.patient_id
     LEFT JOIN users u ON u.id=pr.provider_id
     JOIN clinics c ON c.id=pr.clinic_id
     LEFT JOIN encounters e ON e.appointment_id=pr.appointment_id
     WHERE pr.id=$1 AND pr.clinic_id=$2`,
    [req.params.id, req.user.clinicId]
  );
  const row = pr.rows[0];
  if (!row) return res.status(404).json({ error: "not_found" });

  const items = await q(
    "SELECT medication, dose, frequency, duration, notes FROM prescription_items WHERE prescription_id=$1",
    [row.id]
  );

  // helpers
  const NAVY = "#0B1F3B";
  const TEAL = "#0d9488";
  const GRAY = "#64748b";
  const LIGHT = "#f0fdfa";
  const BORDER = "#cbd5e1";

  const edad = (() => {
    if (!row.birth_date) return "—";
    const b = new Date(row.birth_date);
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
    return `${a} años`;
  })();
  const sexo = { male: "Masculino", female: "Femenino", other: "Otro" }[row.sex] || "—";
  const emitida = new Date(row.created_at);
  const fecha = emitida.toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });
  const hora = emitida.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  const numReceta = row.id.split("-")[0].toUpperCase();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receta-${numReceta}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 0 });
  doc.pipe(res);

  const W = doc.page.width;   // 595
  const M = 46;               // margen
  const CW = W - M * 2;       // ancho útil

  /* ---------- Cabecera ---------- */
  doc.rect(0, 0, W, 96).fill(NAVY);
  doc.rect(0, 96, W, 4).fill(TEAL);

  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(21).text(row.clinic_name || "AGX Salud", M, 24, { width: CW * 0.6 });
  doc.font("Helvetica").fontSize(9.5).fillColor("#c7e8e3").text("Sistema de gestión clínica AGX Salud", M, 52);
  doc.text("Ecuador", M, 65);

  doc.font("Helvetica-Bold").fontSize(15).fillColor("#ffffff")
     .text("RECETA MÉDICA", M, 26, { width: CW, align: "right" });
  doc.font("Helvetica").fontSize(9.5).fillColor("#c7e8e3")
     .text(`Receta No. ${numReceta}`, M, 48, { width: CW, align: "right" })
     .text(`Emitida: ${fecha} · ${hora}`, M, 61, { width: CW, align: "right" })
     .text("Validez: 72 horas desde su emisión", M, 74, { width: CW, align: "right" });

  /* ---------- Datos del paciente ---------- */
  let y = 122;
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(TEAL).text("DATOS DEL PACIENTE", M, y);
  y += 16;

  const boxH = 64;
  doc.roundedRect(M, y, CW, boxH, 6).lineWidth(0.8).strokeColor(BORDER).stroke();

  const col = CW / 3;
  const field = (label, value, cx, cy) => {
    doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(label, cx, cy);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text(value || "—", cx, cy + 11, { width: col - 24 });
  };
  field("PACIENTE", `${row.first_name} ${row.last_name}`, M + 14, y + 10);
  field("CÉDULA / ID", row.id_number, M + 14 + col, y + 10);
  field("EDAD", edad, M + 14 + col * 2, y + 10);
  field("SEXO", sexo, M + 14, y + 38);
  field("ALERGIAS", row.allergies, M + 14 + col, y + 38);
  field("PROFESIONAL", row.provider_name, M + 14 + col * 2, y + 38);

  y += boxH + 16;

  /* ---------- Diagnóstico ---------- */
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(TEAL).text("DIAGNÓSTICO", M, y);
  y += 15;
  doc.font("Helvetica").fontSize(10).fillColor(NAVY)
     .text(row.diagnosis || "No registrado (ver historia clínica)", M, y, { width: CW });
  y = doc.y + 14;

  /* ---------- Prescripción ---------- */
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(TEAL)
     .text("Rx    PRESCRIPCIÓN", M, y);
  doc.font("Helvetica").fontSize(8).fillColor(GRAY)
     .text("Medicamentos en Denominación Común Internacional (DCI)", M + 110, y + 2);
  y += 18;

  // tabla
  const cols = [26, 190, 90, 100, 97]; // # / medicamento / dosis / frecuencia / duración
  const cx = [M, M + cols[0], M + cols[0] + cols[1], M + cols[0] + cols[1] + cols[2], M + cols[0] + cols[1] + cols[2] + cols[3]];
  const headH = 20;

  doc.rect(M, y, CW, headH).fill(LIGHT);
  doc.lineWidth(0.8).strokeColor(BORDER).rect(M, y, CW, headH).stroke();
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(NAVY);
  doc.text("No.", cx[0] + 4, y + 6, { width: cols[0] - 8 });
  doc.text("MEDICAMENTO (DCI) / CONCENTRACIÓN", cx[1] + 4, y + 6, { width: cols[1] - 8 });
  doc.text("DOSIS", cx[2] + 4, y + 6, { width: cols[2] - 8 });
  doc.text("FRECUENCIA", cx[3] + 4, y + 6, { width: cols[3] - 8 });
  doc.text("DURACIÓN", cx[4] + 4, y + 6, { width: cols[4] - 8 });
  y += headH;

  doc.font("Helvetica").fontSize(9.5);
  const rows = items.rows.length ? items.rows : [{ medication: "—", dose: "—", frequency: "—", duration: "—", notes: null }];
  rows.forEach((it, idx) => {
    const med = it.medication || "—";
    const medH = doc.heightOfString(med, { width: cols[1] - 8 });
    const noteH = it.notes ? doc.heightOfString(`Nota: ${it.notes}`, { width: cols[1] - 8 }) + 3 : 0;
    const rowH = Math.max(24, medH + noteH + 12);

    doc.lineWidth(0.6).strokeColor(BORDER).rect(M, y, CW, rowH).stroke();
    doc.fillColor(NAVY);
    doc.text(String(idx + 1), cx[0] + 4, y + 7, { width: cols[0] - 8 });
    doc.font("Helvetica-Bold").text(med, cx[1] + 4, y + 7, { width: cols[1] - 8 });
    if (it.notes) doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(`Nota: ${it.notes}`, cx[1] + 4, y + 7 + medH + 2, { width: cols[1] - 8 });
    doc.font("Helvetica").fontSize(9.5).fillColor(NAVY);
    doc.text(it.dose || "—", cx[2] + 4, y + 7, { width: cols[2] - 8 });
    doc.text(it.frequency || "—", cx[3] + 4, y + 7, { width: cols[3] - 8 });
    doc.text(it.duration || "—", cx[4] + 4, y + 7, { width: cols[4] - 8 });
    y += rowH;
  });

  y += 16;

  /* ---------- Indicaciones ---------- */
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(TEAL).text("INDICACIONES PARA EL PACIENTE", M, y);
  y += 15;
  const indic = row.instructions || "Seguir la prescripción indicada. Ante cualquier reacción adversa, suspenda el medicamento y comuníquese con su médico.";
  const indicH = Math.max(34, doc.heightOfString(indic, { width: CW - 24 }) + 16);
  doc.roundedRect(M, y, CW, indicH, 6).lineWidth(0.8).strokeColor(BORDER).stroke();
  doc.font("Helvetica").fontSize(9.5).fillColor(NAVY).text(indic, M + 12, y + 8, { width: CW - 24 });
  y += indicH + 12;

  /* ---------- Advertencia ---------- */
  doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(
    "No se automedique. Mantenga los medicamentos fuera del alcance de los niños. Complete el tratamiento aunque los síntomas desaparezcan.",
    M, y, { width: CW }
  );

  /* ---------- Firma ---------- */
  const sigY = Math.max(y + 60, 660);
  const sigW = 200;
  doc.lineWidth(0.8).strokeColor(NAVY)
     .moveTo(M, sigY).lineTo(M + sigW, sigY).stroke();
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY).text(row.provider_name || "Profesional prescriptor", M, sigY + 6, { width: sigW });
  doc.font("Helvetica").fontSize(8.5).fillColor(GRAY)
     .text("Firma y sello del profesional", M, sigY + 20, { width: sigW })
     .text("Reg. profesional (ACESS): ____________________", M, sigY + 33, { width: sigW + 60 });

  // sello (círculo punteado a la derecha)
  doc.save();
  doc.circle(W - M - 70, sigY - 4, 38).dash(3, { space: 3 }).lineWidth(0.8).strokeColor(BORDER).stroke();
  doc.undash();
  doc.font("Helvetica").fontSize(7.5).fillColor(GRAY).text("SELLO", W - M - 84, sigY - 8);
  doc.restore();

  /* ---------- Pie ---------- */
  const footY = doc.page.height - 60;
  doc.rect(0, footY, W, 60).fill(LIGHT);
  doc.font("Helvetica").fontSize(7.5).fillColor(GRAY).text(
    "Receta elaborada conforme a la normativa de prescripción del Ministerio de Salud Pública del Ecuador (prescripción en DCI, letra legible, validez de 72 horas). " +
    "Este documento requiere firma y sello del profesional prescriptor para su validez legal.",
    M, footY + 12, { width: CW, align: "center" }
  );
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(TEAL).text(
    `${row.clinic_name || "AGX Salud"} · Documento generado electrónicamente · Receta No. ${numReceta}`,
    M, footY + 38, { width: CW, align: "center" }
  );

  doc.end();
}));

export default router;
