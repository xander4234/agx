import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: JWT_SECRET es obligatorio en producción.");
    process.exit(1);
  }
  console.warn("⚠ JWT_SECRET no definido — usando secreto de desarrollo. NO usar en producción.");
  return "agx_dev_secret_change_me";
})();

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}
export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken({ userId, clinicId, role, name }) {
  return jwt.sign({ userId, clinicId, role, name }, JWT_SECRET, { expiresIn: "7d" });
}

/** Envuelve handlers async para que los errores lleguen al error handler global. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v);

/** Middleware: valida que los params indicados sean UUID (evita 500 de Postgres). */
export function uuidParams(...names) {
  return (req, res, next) => {
    for (const n of names) {
      if (!isUuid(req.params[n])) return res.status(400).json({ error: "invalid_id" });
    }
    next();
  };
}

/** Convierte a string recortado o null. */
export const s = (v, max = 500) =>
  v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim().slice(0, max);

/** Convierte a entero dentro de rango o null. */
export const int = (v, min, max) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i < min || i > max ? null : i;
};

/** Convierte a número decimal dentro de rango o null. */
export const num = (v, min, max) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
};

/** Valida fecha ISO; devuelve ISO string o null. */
export const isoDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
