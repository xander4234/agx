import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { q } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ah, uuidParams, isUuid, s } from "../utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
    cb(null, crypto.randomUUID() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(file.mimetype)),
});

const router = express.Router();
router.use(requireAuth);

// Subir examen/archivo (multipart: file, patient_id, appointment_id?, category?)
router.post("/", upload.single("file"), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "missing_or_invalid_file" });
  const { patient_id, appointment_id } = req.body || {};
  const category = s(req.body?.category, 40) || "exam";

  const cleanup = () => fs.promises.unlink(req.file.path).catch(() => {});

  if (!isUuid(patient_id)) { await cleanup(); return res.status(400).json({ error: "invalid_patient" }); }
  const pat = await q("SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2", [patient_id, req.user.clinicId]);
  if (!pat.rows[0]) { await cleanup(); return res.status(400).json({ error: "invalid_patient" }); }

  let apptId = null;
  if (appointment_id) {
    if (!isUuid(appointment_id)) { await cleanup(); return res.status(400).json({ error: "invalid_appointment" }); }
    const appt = await q("SELECT 1 FROM appointments WHERE id=$1 AND clinic_id=$2", [appointment_id, req.user.clinicId]);
    if (!appt.rows[0]) { await cleanup(); return res.status(400).json({ error: "invalid_appointment" }); }
    apptId = appointment_id;
  }

  const r = await q(
    `INSERT INTO attachments(clinic_id, patient_id, appointment_id, file_name, original_name, mime, size_bytes, category)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.clinicId, patient_id, apptId, req.file.filename,
     s(req.file.originalname, 255) || "archivo", req.file.mimetype, req.file.size, category]
  );
  res.status(201).json(r.rows[0]);
}));

// Listar (?patient_id= o ?appointment_id=)
router.get("/", ah(async (req, res) => {
  const { patient_id, appointment_id } = req.query;
  if (appointment_id) {
    if (!isUuid(appointment_id)) return res.status(400).json({ error: "invalid_appointment" });
    const r = await q(
      "SELECT * FROM attachments WHERE clinic_id=$1 AND appointment_id=$2 ORDER BY created_at DESC",
      [req.user.clinicId, appointment_id]
    );
    return res.json(r.rows);
  }
  if (patient_id) {
    if (!isUuid(patient_id)) return res.status(400).json({ error: "invalid_patient" });
    const r = await q(
      "SELECT * FROM attachments WHERE clinic_id=$1 AND patient_id=$2 ORDER BY created_at DESC",
      [req.user.clinicId, patient_id]
    );
    return res.json(r.rows);
  }
  res.status(400).json({ error: "missing_filter" });
}));

// Descargar
router.get("/:id/download", uuidParams("id"), ah(async (req, res) => {
  const r = await q("SELECT * FROM attachments WHERE id=$1 AND clinic_id=$2", [req.params.id, req.user.clinicId]);
  const f = r.rows[0];
  if (!f) return res.status(404).json({ error: "not_found" });

  const filePath = path.join(uploadDir, f.file_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "file_missing" });

  res.setHeader("Content-Type", f.mime || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(f.original_name)}"`);
  fs.createReadStream(filePath).pipe(res);
}));

// Eliminar
router.delete("/:id", uuidParams("id"), ah(async (req, res) => {
  const r = await q("DELETE FROM attachments WHERE id=$1 AND clinic_id=$2 RETURNING file_name", [req.params.id, req.user.clinicId]);
  if (!r.rows[0]) return res.status(404).json({ error: "not_found" });
  await fs.promises.unlink(path.join(uploadDir, r.rows[0].file_name)).catch(() => {});
  res.json({ ok: true });
}));

export default router;
