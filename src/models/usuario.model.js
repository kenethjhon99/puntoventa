import { pool } from "../config/db.js";

export const getUsuarioByUsername = async (username) => {
  const r = await pool.query(
    `SELECT id_usuario, username, password_hash, nombre, activo
     FROM usuario
     WHERE username = $1
     LIMIT 1`,
    [username]
  );
  return r.rows[0];
};

export const getRolesByUsuario = async (id_usuario) => {
  const r = await pool.query(
    `SELECT r.id_rol, r.nombre_rol
     FROM "Detalle_usuario" du
     JOIN "Rol" r ON r.id_rol = du.id_rol
     WHERE du.id_usuario = $1
     ORDER BY r.nombre_rol`,
    [id_usuario]
  );
  return r.rows; // [{id_rol, nombre_rol}, ...]
};

export const createUsuario = async ({ username, password_hash, nombre, activo = true }) => {
  const r = await pool.query(
    `INSERT INTO "Usuario" (username, password_hash, nombre, activo)
     VALUES ($1,$2,$3,$4)
     RETURNING id_usuario, username, nombre, activo`,
    [username, password_hash, nombre, activo]
  );
  return r.rows[0];
};

export const addRolToUsuario = async (id_usuario, id_rol) => {
  // evita duplicados si ya tiene ese rol
  const r = await pool.query(
    `INSERT INTO "Detalle_usuario" (id_usuario, id_rol)
     VALUES ($1,$2)
     ON CONFLICT DO NOTHING
     RETURNING id_usuario, id_rol`,
    [id_usuario, id_rol]
  );
  return r.rows[0];
};
