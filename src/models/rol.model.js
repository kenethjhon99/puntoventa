import { pool } from "../config/db.js";

export const getRoles = async () => {
  const r = await pool.query(`SELECT id_rol, nombre_rol FROM "Rol" ORDER BY id_rol ASC`);
  return r.rows;
};
