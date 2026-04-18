import { pool } from "../config/db.js";

const BASE_COLUMNS = `
  id_proveedor,
  nombre_empresa,
  telefono_empresa,
  nombre_viajero,
  telefono_viajero,
  nit,
  correo,
  direccion,
  estado,
  created_at,
  updated_at,
  created_by,
  updated_by,
  inactivado_en,
  inactivado_por
`;

export const getProveedoresActivos = async () => {
  const result = await pool.query(`
    SELECT ${BASE_COLUMNS}
    FROM "Proveedor"
    WHERE estado = true
    ORDER BY nombre_empresa ASC
  `);

  return result.rows;
};

export const getProveedores = async ({ incluirInactivos = false } = {}) => {
  const result = await pool.query(
    `
      SELECT ${BASE_COLUMNS}
      FROM "Proveedor"
      WHERE $1::boolean = true OR estado = true
      ORDER BY estado DESC, nombre_empresa ASC
    `,
    [incluirInactivos]
  );

  return result.rows;
};

export const existsProveedorByNit = async (nit, excludeId = null) => {
  const result = await pool.query(
    `
      SELECT 1
      FROM "Proveedor"
      WHERE UPPER(TRIM(nit)) = UPPER(TRIM($1))
        AND ($2::int IS NULL OR id_proveedor <> $2)
      LIMIT 1
    `,
    [nit, excludeId]
  );

  return result.rowCount > 0;
};

export const createProveedor = async ({
  nombre_empresa,
  telefono_empresa = null,
  nombre_viajero = null,
  telefono_viajero = null,
  nit,
  correo = null,
  direccion = null,
  actorId = null,
}) => {
  const result = await pool.query(
    `
      INSERT INTO "Proveedor" (
        nombre_empresa, telefono_empresa,
        nombre_viajero, telefono_viajero,
        nit, correo, direccion,
        estado, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $8)
      RETURNING ${BASE_COLUMNS}
    `,
    [
      nombre_empresa,
      telefono_empresa,
      nombre_viajero,
      telefono_viajero,
      nit,
      correo,
      direccion,
      actorId,
    ]
  );

  return result.rows[0];
};

export const updateProveedor = async (
  id_proveedor,
  {
    nombre_empresa,
    telefono_empresa = null,
    nombre_viajero = null,
    telefono_viajero = null,
    nit,
    correo = null,
    direccion = null,
  },
  actorId = null
) => {
  const result = await pool.query(
    `
      UPDATE "Proveedor"
      SET nombre_empresa   = $1,
          telefono_empresa = $2,
          nombre_viajero   = $3,
          telefono_viajero = $4,
          nit              = $5,
          correo           = $6,
          direccion        = $7,
          updated_by       = $8
      WHERE id_proveedor = $9
      RETURNING ${BASE_COLUMNS}
    `,
    [
      nombre_empresa,
      telefono_empresa,
      nombre_viajero,
      telefono_viajero,
      nit,
      correo,
      direccion,
      actorId,
      id_proveedor,
    ]
  );

  return result.rows[0];
};

export const desactivarProveedor = async (id_proveedor, actorId = null) => {
  const result = await pool.query(
    `
      UPDATE "Proveedor"
      SET estado = false,
          inactivado_en = now(),
          inactivado_por = $2,
          updated_by = $2
      WHERE id_proveedor = $1
        AND estado = true
      RETURNING ${BASE_COLUMNS}
    `,
    [id_proveedor, actorId]
  );

  return result.rows[0];
};
