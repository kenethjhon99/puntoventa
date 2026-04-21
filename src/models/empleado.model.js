import { pool } from "../config/db.js";

const normalizeActorId = (actorId) => {
  const parsed = Number(actorId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const EMPLEADO_COLUMNS = `
  id_empleado,
  nombre,
  cargo,
  tipo_pago,
  activo,
  created_at,
  updated_at,
  created_by,
  updated_by,
  inactivado_en,
  inactivado_por
`;

export const getEmpleados = async ({ incluirInactivos = false } = {}) => {
  const result = await pool.query(
    `
      SELECT ${EMPLEADO_COLUMNS}
      FROM "Empleado"
      WHERE $1::boolean = true OR activo = true
      ORDER BY activo DESC, nombre ASC, id_empleado ASC
    `,
    [incluirInactivos]
  );

  return result.rows;
};

export const createEmpleado = async ({
  nombre,
  cargo,
  tipo_pago,
  actorId = null,
}) => {
  const actor = normalizeActorId(actorId);

  const result = await pool.query(
    `
      INSERT INTO "Empleado" (
        nombre,
        cargo,
        tipo_pago,
        activo,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, true, $4, $4)
      RETURNING ${EMPLEADO_COLUMNS}
    `,
    [nombre, cargo, tipo_pago, actor]
  );

  return result.rows[0];
};

export const updateEmpleado = async (
  id_empleado,
  { nombre, cargo, tipo_pago },
  actorId = null
) => {
  const actor = normalizeActorId(actorId);

  const result = await pool.query(
    `
      UPDATE "Empleado"
      SET nombre = $1,
          cargo = $2,
          tipo_pago = $3,
          updated_by = $4,
          updated_at = now()
      WHERE id_empleado = $5
      RETURNING ${EMPLEADO_COLUMNS}
    `,
    [nombre, cargo, tipo_pago, actor, id_empleado]
  );

  return result.rows[0];
};

export const desactivarEmpleado = async (id_empleado, actorId = null) => {
  const actor = normalizeActorId(actorId);

  const result = await pool.query(
    `
      UPDATE "Empleado"
      SET activo = false,
          inactivado_en = now(),
          inactivado_por = $2::int,
          updated_by = $2::int
      WHERE id_empleado = $1
        AND activo = true
      RETURNING ${EMPLEADO_COLUMNS}
    `,
    [id_empleado, actor]
  );

  return result.rows[0];
};

export const activarEmpleado = async (id_empleado, actorId = null) => {
  const actor = normalizeActorId(actorId);

  const result = await pool.query(
    `
      UPDATE "Empleado"
      SET activo = true,
          inactivado_en = NULL,
          inactivado_por = NULL,
          updated_by = $2::int
      WHERE id_empleado = $1
        AND activo = false
      RETURNING ${EMPLEADO_COLUMNS}
    `,
    [id_empleado, actor]
  );

  return result.rows[0];
};
