import { pool } from "../config/db.js";

// Lista usuarios (con persona) + roles en arreglo
export const listarUsuarios = async () => {
  const r = await pool.query(`
    SELECT 
      u.id_usuario, u.username, u.nombre, u.activo,
      p.id_persona, p.dpi_persona, p.nombre AS persona_nombre, p.apellido AS persona_apellido,
      p.telefono, p.direccion_persona, p.fecha_nacimiento, p.estado AS persona_estado,
      COALESCE(
        json_agg(json_build_object('id_rol', r2.id_rol, 'nombre_rol', r2.nombre_rol))
        FILTER (WHERE r2.id_rol IS NOT NULL),
        '[]'
      ) AS roles
    FROM "Usuario" u
    LEFT JOIN "Persona" p ON p.id_usuario = u.id_usuario
    LEFT JOIN "Detalle_usuario" du ON du.id_usuario = u.id_usuario
    LEFT JOIN "Rol" r2 ON r2.id_rol = du.id_rol
    GROUP BY u.id_usuario, p.id_persona
    ORDER BY u.id_usuario DESC
  `);
  return r.rows;
};

export const getUsuarioById = async (id_usuario) => {
  const r = await pool.query(
    `SELECT id_usuario, username, nombre, activo
     FROM "Usuario"
     WHERE id_usuario = $1`,
    [id_usuario]
  );
  return r.rows[0];
};

export const actualizarUsuarioBasico = async (id_usuario, { username, nombre }) => {
  const r = await pool.query(
    `UPDATE "Usuario"
     SET username = COALESCE($1, username),
         nombre = COALESCE($2, nombre)
     WHERE id_usuario = $3
     RETURNING id_usuario, username, nombre, activo`,
    [username ?? null, nombre ?? null, id_usuario]
  );
  return r.rows[0];
};

export const actualizarPersona = async (id_usuario, data) => {
  // actualiza solo campos enviados
  const fields = [];
  const values = [];
  let i = 1;

  for (const key of Object.keys(data)) {
    fields.push(`${key} = $${i}`);
    values.push(data[key]);
    i++;
  }

  if (fields.length === 0) return null;

  const r = await pool.query(
    `UPDATE "Persona"
     SET ${fields.join(", ")}
     WHERE id_usuario = $${i}
     RETURNING *`,
    [...values, id_usuario]
  );

  return r.rows[0];
};

export const setActivoUsuario = async (id_usuario, activo) => {
  const r = await pool.query(
    `UPDATE "Usuario"
     SET activo = $1
     WHERE id_usuario = $2
     RETURNING id_usuario, username, nombre, activo`,
    [activo, id_usuario]
  );
  return r.rows[0];
};

export const asignarRol = async (id_usuario, id_rol) => {
  const r = await pool.query(
    `INSERT INTO "Detalle_usuario" (id_usuario, id_rol)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING id_usuario, id_rol`,
    [id_usuario, id_rol]
  );
  return r.rows[0]; // si ya existía, devuelve undefined
};

export const quitarRol = async (id_usuario, id_rol) => {
  const r = await pool.query(
    `DELETE FROM "Detalle_usuario"
     WHERE id_usuario = $1 AND id_rol = $2
     RETURNING id_usuario, id_rol`,
    [id_usuario, id_rol]
  );
  return r.rows[0];
};
