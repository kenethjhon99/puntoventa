import { pool } from "../config/db.js";

const CLIENTE_CODE_PREFIX = "CL-";

const buildClienteCode = (numero) => {
  return `${CLIENTE_CODE_PREFIX}${String(numero).padStart(4, "0")}`;
};

export const getClientes = async ({ incluirInactivos = false } = {}) => {
  const result = await pool.query(
    `
      SELECT
        "Id_clientes" AS id_cliente,
        codigo,
        nit,
        nombre,
        UPPER(COALESCE(tipo_cliente, 'NORMAL')) AS tipo_cliente,
        telefono,
        correo,
        direccion,
        estado,
        created_at,
        updated_at,
        created_by,
        updated_by,
        inactivado_en,
        inactivado_por
      FROM "Clientes"
      WHERE $1::boolean = true OR estado = true
      ORDER BY estado DESC, nombre ASC NULLS LAST, codigo ASC
    `,
    [incluirInactivos]
  );

  return result.rows;
};

export const existsClienteByCodigo = async (codigo, excludeId = null) => {
  const result = await pool.query(
    `
      SELECT 1
      FROM "Clientes"
      WHERE UPPER(TRIM(codigo)) = UPPER(TRIM($1))
        AND ($2::int IS NULL OR "Id_clientes" <> $2)
      LIMIT 1
    `,
    [codigo, excludeId]
  );

  return result.rowCount > 0;
};

export const existsClienteByNit = async (nit, excludeId = null) => {
  if (!nit) return false;

  const result = await pool.query(
    `
      SELECT 1
      FROM "Clientes"
      WHERE UPPER(TRIM(nit)) = UPPER(TRIM($1))
        AND ($2::int IS NULL OR "Id_clientes" <> $2)
      LIMIT 1
    `,
    [nit, excludeId]
  );

  return result.rowCount > 0;
};

export const createCliente = async ({
  nit = null,
  nombre,
  tipo_cliente = "NORMAL",
  telefono = null,
  correo = null,
  direccion = null,
  actorId = null,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`LOCK TABLE "Clientes" IN SHARE ROW EXCLUSIVE MODE`);

    const nextCodeResult = await client.query(
      `
        SELECT COALESCE(MAX(SUBSTRING(codigo FROM '[0-9]+$')::int), 0) + 1 AS next_number
        FROM "Clientes"
        WHERE codigo ~ '^CL-[0-9]+$'
      `
    );

    const codigo = buildClienteCode(nextCodeResult.rows[0]?.next_number || 1);

    const result = await client.query(
      `
        INSERT INTO "Clientes" (codigo, nit, nombre, tipo_cliente, telefono, correo, direccion, estado, created_by, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $8)
        RETURNING
          "Id_clientes" AS id_cliente,
          codigo,
          nit,
          nombre,
          UPPER(COALESCE(tipo_cliente, 'NORMAL')) AS tipo_cliente,
          telefono,
          correo,
          direccion,
          estado,
          created_at,
          updated_at,
          created_by,
          updated_by,
          inactivado_en,
          inactivado_por
      `,
      [codigo, nit, nombre, tipo_cliente, telefono, correo, direccion, actorId]
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateCliente = async (
  id_cliente,
  {
    nit = null,
    nombre,
    tipo_cliente = "NORMAL",
    telefono = null,
    correo = null,
    direccion = null,
  },
  actorId = null
) => {
  const result = await pool.query(
    `
      UPDATE "Clientes"
      SET nit = $1,
          nombre = $2,
          tipo_cliente = $3,
          telefono = $4,
          correo = $5,
          direccion = $6,
          updated_by = $7
      WHERE "Id_clientes" = $8
      RETURNING
        "Id_clientes" AS id_cliente,
        codigo,
        nit,
        nombre,
        UPPER(COALESCE(tipo_cliente, 'NORMAL')) AS tipo_cliente,
        telefono,
        correo,
        direccion,
        estado,
        created_at,
        updated_at,
        created_by,
        updated_by,
        inactivado_en,
        inactivado_por
    `,
    [nit, nombre, tipo_cliente, telefono, correo, direccion, actorId, id_cliente]
  );

  return result.rows[0];
};

export const desactivarCliente = async (id_cliente, actorId = null) => {
  const result = await pool.query(
    `
      UPDATE "Clientes"
      SET estado = false,
          inactivado_en = now(),
          inactivado_por = $2,
          updated_by = $2
      WHERE "Id_clientes" = $1
        AND estado = true
      RETURNING
        "Id_clientes" AS id_cliente,
        codigo,
        nit,
        nombre,
        UPPER(COALESCE(tipo_cliente, 'NORMAL')) AS tipo_cliente,
        telefono,
        correo,
        direccion,
        estado,
        created_at,
        updated_at,
        created_by,
        updated_by,
        inactivado_en,
        inactivado_por
    `,
    [id_cliente, actorId]
  );

  return result.rows[0];
};
