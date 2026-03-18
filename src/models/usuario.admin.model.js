import { pool } from "../config/db.js";

export const listarUsuarios = async () => {
  const r = await pool.query(`
    SELECT
      u.id_usuario, u.username, u.nombre, u.activo, u.created_at, u.updated_at,
      p.id_persona, p.dpi_persona, p.nombre AS persona_nombre, p.apellido AS persona_apellido,
      p.telefono, p.direccion_persona, p.fecha_nacimiento, p.estado AS persona_estado,
      p.created_at AS persona_created_at,
      p.updated_at AS persona_updated_at,
      COALESCE(
        json_agg(json_build_object('id_rol', r2.id_rol, 'nombre_rol', r2.nombre_rol))
        FILTER (WHERE r2.id_rol IS NOT NULL),
        '[]'
      ) AS roles
    FROM "Usuario" u
    LEFT JOIN "Persona" p ON p.id_usuario = u.id_usuario
    LEFT JOIN "Detalle_usuario" du
      ON du.id_usuario = u.id_usuario
     AND COALESCE(du.activo, true) = true
    LEFT JOIN "Rol" r2 ON r2.id_rol = du.id_rol
    GROUP BY u.id_usuario, p.id_persona
    ORDER BY u.id_usuario DESC
  `);
  return r.rows;
};

export const getUsuarioById = async (id_usuario) => {
  const r = await pool.query(
    `SELECT id_usuario, username, nombre, activo, created_at, updated_at
     FROM "Usuario"
     WHERE id_usuario = $1`,
    [id_usuario]
  );
  return r.rows[0];
};

export const actualizarUsuarioBasico = async (id_usuario, { username, nombre }, actorId = null) => {
  const r = await pool.query(
    `UPDATE "Usuario"
     SET username = COALESCE($1, username),
         nombre = COALESCE($2, nombre),
         updated_by = $3
     WHERE id_usuario = $4
     RETURNING id_usuario, username, nombre, activo, created_at, updated_at`,
    [username ?? null, nombre ?? null, actorId, id_usuario]
  );
  return r.rows[0];
};

export const actualizarPersona = async (id_usuario, data, actorId = null) => {
  const fields = [];
  const values = [];
  let i = 1;

  for (const key of Object.keys(data)) {
    fields.push(`${key} = $${i}`);
    values.push(data[key]);
    i++;
  }

  fields.push(`updated_by = $${i}`);
  values.push(actorId);
  i++;

  const r = await pool.query(
    `UPDATE "Persona"
     SET ${fields.join(", ")}
     WHERE id_usuario = $${i}
     RETURNING *`,
    [...values, id_usuario]
  );

  return r.rows[0];
};

export const setActivoUsuario = async (id_usuario, activo, actorId = null) => {
  const r = await pool.query(
    `UPDATE "Usuario"
     SET activo = $1,
         inactivado_en = CASE WHEN $1 = false THEN now() ELSE null END,
         inactivado_por = CASE WHEN $1 = false THEN $3 ELSE null END,
         updated_by = $3
     WHERE id_usuario = $2
     RETURNING id_usuario, username, nombre, activo, created_at, updated_at, inactivado_en, inactivado_por`,
    [activo, id_usuario, actorId]
  );
  return r.rows[0];
};

export const asignarRol = async (id_usuario, id_rol, actorId = null) => {
  const existing = await pool.query(
    `SELECT id_usuario, id_rol, COALESCE(activo, true) AS activo
     FROM "Detalle_usuario"
     WHERE id_usuario = $1 AND id_rol = $2
     LIMIT 1`,
    [id_usuario, id_rol]
  );

  if (existing.rowCount > 0) {
    if (existing.rows[0].activo) {
      return existing.rows[0];
    }

    const reactivated = await pool.query(
      `UPDATE "Detalle_usuario"
       SET activo = true,
           inactivado_en = null,
           inactivado_por = null,
           updated_by = $3
       WHERE id_usuario = $1 AND id_rol = $2
       RETURNING id_usuario, id_rol`,
      [id_usuario, id_rol, actorId]
    );

    return reactivated.rows[0];
  }

  const r = await pool.query(
    `INSERT INTO "Detalle_usuario" (id_usuario, id_rol, activo, created_by, updated_by)
     VALUES ($1, $2, true, $3, $3)
     RETURNING id_usuario, id_rol`,
    [id_usuario, id_rol, actorId]
  );
  return r.rows[0];
};

export const quitarRol = async (id_usuario, id_rol, actorId = null) => {
  const r = await pool.query(
    `UPDATE "Detalle_usuario"
     SET activo = false,
         inactivado_en = now(),
         inactivado_por = $3,
         updated_by = $3
     WHERE id_usuario = $1
       AND id_rol = $2
       AND COALESCE(activo, true) = true
     RETURNING id_usuario, id_rol`,
    [id_usuario, id_rol, actorId]
  );
  return r.rows[0];
};
