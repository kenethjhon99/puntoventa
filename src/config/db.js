import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: false, // local
});

export async function testDB() {
  const r = await pool.query("SELECT NOW() AS ahora");
  console.log("✅ Postgres conectado:", r.rows[0].ahora);
}
