import express from "express";
import PDFDocument from "pdfkit";
import { q } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

// Create prescription
router.post("/", async (req, res) => {
  const { appointment_id, patient_id, provider_id, instructions, items } = req.body || {};
  if (!appointment_id || !patient_id) return res.status(400).json({ error: "missing_fields" });

  const pr = await q(
    `INSERT INTO prescriptions(clinic_id, appointment_id, provider_id, patient_id, instructions)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.clinicId, appointment_id, provider_id || req.user.userId, patient_id, instructions || null]
  );

  const prescription = pr.rows[0];

  const arr = Array.isArray(items) ? items : [];
  for (const it of arr) {
    if (!it?.medication) continue;
    await q(
      `INSERT INTO prescription_items(prescription_id, medication, dose, frequency, duration, notes)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [prescription.id, it.medication, it.dose || null, it.frequency || null, it.duration || null, it.notes || null]
    );
  }

  res.json(prescription);
});

// Get prescription
router.get("/:id", async (req, res) => {
  const pr = await q("SELECT * FROM prescriptions WHERE id=$1 AND clinic_id=$2", [req.params.id, req.user.clinicId]);
  if (!pr.rows[0]) return res.status(404).json({ error: "not_found" });
  const items = await q("SELECT * FROM prescription_items WHERE prescription_id=$1", [req.params.id]);
  res.json({ ...pr.rows[0], items: items.rows });
});

// PDF
router.get("/:id/pdf", async (req, res) => {
  const pr = await q(
    `SELECT pr.*, p.first_name, p.last_name, u.full_name as provider_name, c.name as clinic_name
     FROM prescriptions pr
     JOIN patients p ON p.id=pr.patient_id
     LEFT JOIN users u ON u.id=pr.provider_id
     JOIN clinics c ON c.id=pr.clinic_id
     WHERE pr.id=$1 AND pr.clinic_id=$2`,
    [req.params.id, req.user.clinicId]
  );
  const row = pr.rows[0];
  if (!row) return res.status(404).json({ error: "not_found" });

  const items = await q("SELECT medication, dose, frequency, duration, notes FROM prescription_items WHERE prescription_id=$1", [row.id]);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receta-${row.id}.pdf"`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).fillColor("#0B1F3B").text(row.clinic_name || "AGX SOLUCIONES", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor("#475569").text("Receta / Prescripción", { align: "left" });
  doc.moveDown(1);

  doc.fontSize(12).fillColor("#0F172A").text(`Paciente: ${row.first_name} ${row.last_name}`);
  doc.text(`Profesional: ${row.provider_name || "No asignado"}`);
  doc.text(`Fecha: ${new Date(row.created_at).toLocaleString()}`);
  doc.moveDown(1);

  doc.fontSize(12).fillColor("#0B1F3B").text("Medicamentos:", { underline: true });
  doc.moveDown(0.5);

  if (!items.rows.length) {
    doc.fillColor("#475569").text("Sin ítems (demo).");
  } else {
    doc.fillColor("#0F172A");
    items.rows.forEach((it, idx) => {
      doc.text(`${idx+1}. ${it.medication}`);
      const details = [
        it.dose ? `Dosis: ${it.dose}` : null,
        it.frequency ? `Frecuencia: ${it.frequency}` : null,
        it.duration ? `Duración: ${it.duration}` : null,
      ].filter(Boolean).join(" | ");
      if (details) doc.fillColor("#475569").text(`   ${details}`);
      if (it.notes) doc.fillColor("#475569").text(`   Nota: ${it.notes}`);
      doc.moveDown(0.3);
      doc.fillColor("#0F172A");
    });
  }

  if (row.instructions) {
    doc.moveDown(0.8);
    doc.fillColor("#0B1F3B").text("Indicaciones:", { underline: true });
    doc.moveDown(0.4);
    doc.fillColor("#0F172A").text(row.instructions);
  }

  doc.moveDown(2);
  doc.fillColor("#475569").fontSize(10).text("Documento generado por sistema (MVP). Validar requisitos legales y firma electrónica según normativa aplicable.", { align: "left" });

  doc.end();
});

export default router;
