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
   PDF de receta — formato A5 (media hoja, estándar de recetario)
   conforme a la normativa de prescripción del MSP Ecuador:
   identificación del establecimiento y profesional, datos del
   paciente, diagnóstico (CIE-10), prescripción en DCI con dosis,
   frecuencia y duración, validez de 72 horas, firma y sello.
   ============================================================ */
router.get("/:id/pdf", uuidParams("id"), ah(async (req, res) => {
  const pr = await q(
    `SELECT pr.*, p.first_name, p.last_name, p.id_number, p.birth_date, p.sex, p.allergies,
            u.full_name AS provider_name, c.name AS clinic_name,
            e.assessment AS diagnosis, e.cie10_code, e.cie10_desc
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

  // paleta
  const NAVY = "#0B1F3B";
  const TEAL = "#0d9488";
  const TEAL_SOFT = "#5eead4";
  const GRAY = "#64748b";
  const LIGHT = "#f0fdfa";
  const BORDER = "#cbd5e1";
  const RED = "#dc2626";

  const edad = (() => {
    if (!row.birth_date) return "—";
    const b = new Date(row.birth_date);
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) a--;
    return `${a} años`;
  })();
  const sexo = { male: "M", female: "F", other: "—" }[row.sex] || "—";
  const emitida = new Date(row.created_at);
  const fecha = emitida.toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });
  const hora = emitida.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  const numReceta = row.id.split("-")[0].toUpperCase();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receta-${numReceta}.pdf"`);

  // ---- A5: tamaño estándar de recetario (media hoja) ----
  const doc = new PDFDocument({ size: "A5", margin: 0 });
  doc.pipe(res);

  const W = doc.page.width;    // ~420
  const H = doc.page.height;   // ~595
  const M = 26;                // margen
  const CW = W - M * 2;

  const drawHeader = () => {
    doc.rect(0, 0, W, 62).fill(NAVY);
    doc.rect(0, 62, W, 3).fill(TEAL);
    // cruz médica decorativa
    doc.save().translate(W - M - 16, 14);
    doc.roundedRect(4.5, 0, 5, 14, 1.5).fill(TEAL_SOFT);
    doc.roundedRect(0, 4.5, 14, 5, 1.5).fill(TEAL_SOFT);
    doc.restore();

    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(13.5)
       .text(row.clinic_name || "AGX Salud", M, 12, { width: CW - 40 });
    doc.font("Helvetica").fontSize(7.5).fillColor("#8fd8cd")
       .text((row.provider_name ? `${row.provider_name} · ` : "") + "Ecuador", M, 30, { width: CW - 40 });

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
       .text(`RECETA MÉDICA  Nº ${numReceta}`, M, 44, { continued: false });
    doc.font("Helvetica").fontSize(7.5).fillColor("#8fd8cd")
       .text(`${fecha} · ${hora} · válida 72 h`, M, 44, { width: CW, align: "right" });
  };
  drawHeader();

  let y = 76;
  const ensureSpace = (h) => {
    if (y + h <= H - 40) return;
    doc.addPage({ size: "A5", margin: 0 });
    drawHeader();
    y = 76;
  };

  /* ---------- Paciente (franja compacta) ---------- */
  const pBoxH = 40;
  doc.roundedRect(M, y, CW, pBoxH, 6).fill(LIGHT);
  doc.roundedRect(M, y, CW, pBoxH, 6).lineWidth(0.7).strokeColor(TEAL_SOFT).stroke();
  const half = CW / 2;
  const mini = (label, value, cx, cy, w, valueColor = NAVY) => {
    doc.font("Helvetica").fontSize(6.5).fillColor(GRAY).text(label, cx, cy);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(valueColor)
       .text(value || "—", cx, cy + 8, { width: w, ellipsis: true, height: 10 });
  };
  mini("PACIENTE", `${row.first_name} ${row.last_name}`, M + 10, y + 5, half + 30);
  mini("CÉDULA", row.id_number, M + half + 55, y + 5, 68);
  mini("EDAD/SEXO", `${edad} · ${sexo}`, M + CW - 62, y + 5, 56);
  mini("ALERGIAS", row.allergies || "Ninguna referida", M + 10, y + 22, half + 30, row.allergies ? RED : NAVY);
  mini("DIAGNÓSTICO (CIE-10)",
    row.cie10_code ? `${row.cie10_code} — ${row.cie10_desc || row.diagnosis || ""}` : (row.diagnosis || "—"),
    M + half + 55, y + 22, half - 65);
  y += pBoxH + 12;

  /* ---------- Rx ---------- */
  doc.font("Times-BoldItalic").fontSize(22).fillColor(TEAL).text("Rx", M, y - 4);
  doc.font("Helvetica").fontSize(6.5).fillColor(GRAY)
     .text("PRESCRIPCIÓN EN DENOMINACIÓN COMÚN INTERNACIONAL (DCI)", M + 34, y + 4);
  doc.moveTo(M + 34, y + 14).lineTo(M + CW, y + 14).lineWidth(0.6).strokeColor(BORDER).stroke();
  y += 24;

  const meds = items.rows.length ? items.rows : [{ medication: "—" }];
  meds.forEach((it, idx) => {
    const med = it.medication || "—";
    const detail = [it.dose, it.frequency, it.duration].filter(Boolean).join("  ·  ");
    const medH = doc.font("Helvetica-Bold").fontSize(9.5).heightOfString(med, { width: CW - 30 });
    const detH = detail ? doc.font("Helvetica").fontSize(8).heightOfString(detail, { width: CW - 30 }) : 0;
    const noteH = it.notes ? doc.font("Helvetica-Oblique").fontSize(7).heightOfString(it.notes, { width: CW - 30 }) : 0;
    const blockH = medH + (detH ? detH + 2 : 0) + (noteH ? noteH + 2 : 0) + 10;
    ensureSpace(blockH);

    // número en círculo
    doc.circle(M + 7, y + 6, 7).lineWidth(0.8).strokeColor(TEAL).stroke();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(TEAL)
       .text(String(idx + 1), M, y + 3, { width: 14, align: "center" });

    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY).text(med, M + 20, y, { width: CW - 30 });
    let yy = y + medH;
    if (detail) {
      doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(detail, M + 20, yy + 2, { width: CW - 30 });
      yy += detH + 2;
    }
    if (it.notes) {
      doc.font("Helvetica-Oblique").fontSize(7).fillColor(GRAY).text(it.notes, M + 20, yy + 2, { width: CW - 30 });
      yy += noteH + 2;
    }
    // separador punteado
    doc.save().moveTo(M + 20, yy + 5).lineTo(M + CW, yy + 5).dash(1.5, { space: 2.5 }).lineWidth(0.5).strokeColor(BORDER).stroke().undash().restore();
    y = yy + 10;
  });

  /* ---------- Indicaciones ---------- */
  const indic = row.instructions ||
    "Seguir la prescripción indicada. Ante cualquier reacción adversa, suspenda el medicamento y consulte a su médico.";
  const indicH = doc.font("Helvetica").fontSize(8).heightOfString(indic, { width: CW - 20 }) + 20;
  ensureSpace(indicH + 14);
  doc.roundedRect(M, y, CW, indicH, 5).fill("#fafcfc");
  doc.roundedRect(M, y, CW, indicH, 5).lineWidth(0.6).strokeColor(BORDER).stroke();
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(TEAL).text("INDICACIONES", M + 10, y + 6);
  doc.font("Helvetica").fontSize(8).fillColor(NAVY).text(indic, M + 10, y + 15, { width: CW - 20 });
  y += indicH + 10;

  /* ---------- Firma y sello (anclados abajo) ---------- */
  const sigZoneY = Math.max(y + 12, H - 118);
  if (sigZoneY + 90 > H) { ensureSpace(120); }
  const sy = Math.max(y + 12, H - 118);

  // sello punteado a la izquierda
  doc.save();
  doc.circle(M + 34, sy + 28, 26).dash(2.5, { space: 2.5 }).lineWidth(0.7).strokeColor(BORDER).stroke();
  doc.undash();
  doc.font("Helvetica").fontSize(6).fillColor(GRAY).text("SELLO", M + 22, sy + 25);
  doc.restore();

  // línea de firma a la derecha
  const sigW = 150;
  const sigX = W - M - sigW;
  doc.moveTo(sigX, sy + 38).lineTo(sigX + sigW, sy + 38).lineWidth(0.8).strokeColor(NAVY).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(NAVY)
     .text(row.provider_name || "Profesional prescriptor", sigX, sy + 42, { width: sigW, align: "center" });
  doc.font("Helvetica").fontSize(6.5).fillColor(GRAY)
     .text("Firma y sello del profesional", sigX, sy + 53, { width: sigW, align: "center" })
     .text("Reg. ACESS: ______________________", sigX, sy + 62, { width: sigW, align: "center" });

  /* ---------- Pie ---------- */
  doc.page.margins.bottom = 0;
  doc.rect(0, H - 26, W, 26).fill(LIGHT);
  doc.rect(0, H - 26, W, 1.5).fill(TEAL_SOFT);
  doc.font("Helvetica").fontSize(5.6).fillColor(GRAY).text(
    "Prescripción en DCI · Normativa MSP Ecuador · Validez 72 horas · No se automedique",
    M, H - 19, { width: CW, align: "center", lineBreak: false }
  );
  doc.font("Helvetica-Bold").fontSize(5.6).fillColor(TEAL).text(
    `${row.clinic_name || "AGX Salud"} · Receta Nº ${numReceta}`,
    M, H - 11, { width: CW, align: "center", lineBreak: false }
  );

  doc.end();
}));

export default router;
