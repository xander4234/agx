import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5435),
  user: process.env.PGUSER || "agx",
  password: process.env.PGPASSWORD || "agxpass",
  database: process.env.PGDATABASE || "agx_health",
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("Error inesperado en PostgreSQL:", err.message);
});

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} text SQL con placeholders $1, $2...
 * @param {any[]} [params]
 */
export function q(text, params) {
  return pool.query(text, params);
}
