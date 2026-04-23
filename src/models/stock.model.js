import { pool } from "../config/db.js";
import {
  BODEGA_GENERAL,
  BODEGA_GENERAL_VISIBLE,
  BODEGA_TIENDA_TALLER,
  BODEGA_TIENDA_TALLER_VISIBLE,
} from "../constants/inventory.js";
import { requireBodegaLogicaByKey } from "./bodega.model.js";

const LOGICAL_BODEGA_NAMES = [BODEGA_GENERAL, BODEGA_TIENDA_TALLER];

const normalizePositiveInt = (value) => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
};

const resolveLogicalBodegaId = async ({ id_bodega = null, bodega_key = null, executor = null } = {}) => {
  const numericId = normalizePositiveInt(id_bodega);
  if (numericId) {
    return numericId;
  }

  if (!bodega_key) return null;

  const bodega = await requireBodegaLogicaByKey(bodega_key, executor);
  return Number(bodega.id_bodega);
};

const getLogicalStockRowsByProducto = async (id_producto, executor = null) => {
  const db = executor || pool;
  const result = await db.query(
    `
      SELECT
        s.*,
        UPPER(TRIM(b."Nombre")) AS nombre_bodega
      FROM "Stock_producto" s
      JOIN "Bodega" b
        ON b."Id_bodega" = s.id_bodega
      WHERE s.id_producto = $1
        AND UPPER(TRIM(b."Nombre")) IN ($2, $3)
      ORDER BY
        CASE
          WHEN UPPER(TRIM(b."Nombre")) = $2 THEN 1
          ELSE 2
        END,
        s.id_stock ASC
    `,
    [id_producto, ...LOGICAL_BODEGA_NAMES]
  );

  return result.rows;
};

const requireTargetBodegaForProducto = async ({
  id_producto,
  id_bodega = null,
  bodega_key = null,
  executor = null,
} = {}) => {
  const explicitBodegaId = await resolveLogicalBodegaId({
    id_bodega,
    bodega_key,
    executor,
  });

  if (explicitBodegaId) {
    return explicitBodegaId;
  }

  const rows = await getLogicalStockRowsByProducto(id_producto, executor);

  if (rows.length === 1) {
    return Number(rows[0].id_bodega);
  }

  if (rows.length === 0) {
    throw new Error("No existe registro de stock para este producto en las bodegas lógicas");
  }

  throw new Error("Debes indicar la bodega lógica para operar este producto");
};

export const getStock = async ({
  id_bodega = null,
  bodega_key = null,
  q = "",
  solo_bajo_minimo = false,
} = {}) => {
  const resolvedBodegaId = await resolveLogicalBodegaId({ id_bodega, bodega_key });

  if (resolvedBodegaId) {
    const values = [
      resolvedBodegaId,
      ...LOGICAL_BODEGA_NAMES,
      BODEGA_GENERAL_VISIBLE,
      BODEGA_TIENDA_TALLER_VISIBLE,
    ];
    const where = [`s.id_bodega = $1`, `COALESCE(p.activo, true) = true`];
    let index = 6;

    if (q) {
      where.push(`(
        p.nombre ILIKE $${index}
        OR COALESCE(p.descripcion, '') ILIKE $${index}
        OR COALESCE(p.codigo_barras, '') ILIKE $${index}
      )`);
      values.push(`%${q}%`);
      index++;
    }

    if (solo_bajo_minimo) {
      where.push(`
        COALESCE(s.stock_minimo, 0) > 0
        AND COALESCE(s.existencia, 0) <= COALESCE(s.stock_minimo, 0)
      `);
    }

    const result = await pool.query(
      `
      WITH stock_summary AS (
        SELECT
          sp.id_producto,
          COALESCE(SUM(CASE WHEN UPPER(TRIM(b."Nombre")) = $2 THEN sp.existencia ELSE 0 END), 0) AS stock_general,
          COALESCE(SUM(CASE WHEN UPPER(TRIM(b."Nombre")) = $3 THEN sp.existencia ELSE 0 END), 0) AS stock_tienda_taller,
          COALESCE(SUM(sp.existencia), 0) AS stock_total
        FROM "Stock_producto" sp
        JOIN "Bodega" b
          ON b."Id_bodega" = sp.id_bodega
        WHERE UPPER(TRIM(b."Nombre")) IN ($2, $3)
        GROUP BY sp.id_producto
      )
      SELECT
        p.id_producto,
        p.codigo_barras,
        p.nombre,
        p.descripcion,
        COALESCE(p.catalogo, 'GENERAL') AS catalogo,
        p.precio_compra,
        p.precio_venta,
        s.id_stock,
        COALESCE(ss.stock_general, 0) AS stock_general,
        COALESCE(ss.stock_tienda_taller, 0) AS stock_tienda_taller,
        COALESCE(ss.stock_total, COALESCE(s.existencia, 0)) AS stock_total,
        s.existencia,
        s.stock_minimo,
        s.ubicacion,
        s.id_bodega,
        CASE
          WHEN UPPER(TRIM(b."Nombre")) = $2 THEN $4
          ELSE $5
        END AS bodega_nombre_visible,
        GREATEST(COALESCE(s.stock_minimo, 0) - COALESCE(s.existencia, 0), 0) AS faltante,
        (
          COALESCE(s.stock_minimo, 0) > 0
          AND COALESCE(s.existencia, 0) <= COALESCE(s.stock_minimo, 0)
        ) AS bajo_minimo
      FROM "Producto" p
      JOIN "Stock_producto" s
        ON s."id_producto" = p."id_producto"
      JOIN "Bodega" b
        ON b."Id_bodega" = s.id_bodega
      LEFT JOIN stock_summary ss
        ON ss.id_producto = p.id_producto
      WHERE ${where.join(" AND ")}
      ORDER BY
        (
          COALESCE(s.stock_minimo, 0) > 0
          AND COALESCE(s.existencia, 0) <= COALESCE(s.stock_minimo, 0)
        ) DESC,
        p."nombre" ASC
    `,
      values
    );

    return result.rows;
  }

  const values = [
    ...LOGICAL_BODEGA_NAMES,
    BODEGA_GENERAL_VISIBLE,
    BODEGA_TIENDA_TALLER_VISIBLE,
  ];
  const where = [`COALESCE(p.activo, true) = true`];
  let index = 5;

  if (q) {
    where.push(`(
      p.nombre ILIKE $${index}
      OR COALESCE(p.descripcion, '') ILIKE $${index}
      OR COALESCE(p.codigo_barras, '') ILIKE $${index}
    )`);
    values.push(`%${q}%`);
    index++;
  }

  if (solo_bajo_minimo) {
    where.push(`
      COALESCE(ss.stock_minimo_referencia, 0) > 0
      AND COALESCE(ss.stock_total, 0) <= COALESCE(ss.stock_minimo_referencia, 0)
    `);
  }

  const result = await pool.query(
    `
      WITH stock_summary AS (
        SELECT
          sp.id_producto,
          COALESCE(SUM(CASE WHEN UPPER(TRIM(b."Nombre")) = $1 THEN sp.existencia ELSE 0 END), 0) AS stock_general,
          COALESCE(SUM(CASE WHEN UPPER(TRIM(b."Nombre")) = $2 THEN sp.existencia ELSE 0 END), 0) AS stock_tienda_taller,
          COALESCE(SUM(sp.existencia), 0) AS stock_total,
          COALESCE(MAX(sp.stock_minimo), 0) AS stock_minimo_referencia
        FROM "Stock_producto" sp
        JOIN "Bodega" b
          ON b."Id_bodega" = sp.id_bodega
        WHERE UPPER(TRIM(b."Nombre")) IN ($1, $2)
        GROUP BY sp.id_producto
      )
      SELECT
        p.id_producto,
        p.codigo_barras,
        p.nombre,
        p.descripcion,
        COALESCE(p.catalogo, 'GENERAL') AS catalogo,
        p.precio_compra,
        p.precio_venta,
        fallback.id_stock,
        COALESCE(ss.stock_general, 0) AS stock_general,
        COALESCE(ss.stock_tienda_taller, 0) AS stock_tienda_taller,
        COALESCE(ss.stock_total, 0) AS stock_total,
        COALESCE(ss.stock_total, 0) AS existencia,
        COALESCE(ss.stock_minimo_referencia, 0) AS stock_minimo,
        fallback.ubicacion,
        fallback.id_bodega,
        fallback.bodega_nombre_visible,
        GREATEST(COALESCE(ss.stock_minimo_referencia, 0) - COALESCE(ss.stock_total, 0), 0) AS faltante,
        (
          COALESCE(ss.stock_minimo_referencia, 0) > 0
          AND COALESCE(ss.stock_total, 0) <= COALESCE(ss.stock_minimo_referencia, 0)
        ) AS bajo_minimo
      FROM "Producto" p
      LEFT JOIN stock_summary ss
        ON ss.id_producto = p.id_producto
      LEFT JOIN LATERAL (
        SELECT
          sp.id_stock,
          sp.id_bodega,
          sp.ubicacion,
          CASE
            WHEN UPPER(TRIM(b."Nombre")) = $1 THEN $3
            ELSE $4
          END AS bodega_nombre_visible
        FROM "Stock_producto" sp
        JOIN "Bodega" b
          ON b."Id_bodega" = sp.id_bodega
        WHERE sp.id_producto = p.id_producto
          AND UPPER(TRIM(b."Nombre")) IN ($1, $2)
        ORDER BY
          CASE
            WHEN UPPER(TRIM(b."Nombre")) = $1 THEN 1
            ELSE 2
          END,
          sp.id_stock ASC
        LIMIT 1
      ) fallback ON true
      WHERE ${where.join(" AND ")}
      ORDER BY
        (
          COALESCE(ss.stock_minimo_referencia, 0) > 0
          AND COALESCE(ss.stock_total, 0) <= COALESCE(ss.stock_minimo_referencia, 0)
        ) DESC,
        p."nombre" ASC
    `,
    values
  );

  return result.rows;
};

export const getStockByProducto = async (
  id_producto,
  id_bodega = null,
  { bodega_key = null, executor = null } = {}
) => {
  const db = executor || pool;
  const targetBodegaId = await requireTargetBodegaForProducto({
    id_producto,
    id_bodega,
    bodega_key,
    executor: db,
  });
  const r = await db.query(
    `SELECT * FROM "Stock_producto" 
     WHERE id_producto = $1 AND id_bodega = $2`,
    [id_producto, targetBodegaId]
  );
  return r.rows[0];
};

export const setExistencia = async (
  id_producto,
  existencia,
  id_bodega = null,
  { bodega_key = null, executor = null } = {}
) => {
  const db = executor || pool;
  const targetBodegaId = await requireTargetBodegaForProducto({
    id_producto,
    id_bodega,
    bodega_key,
    executor: db,
  });
  const r = await db.query(
    `UPDATE "Stock_producto"
     SET existencia = $1
     WHERE id_producto = $2 AND id_bodega = $3
     RETURNING *`,
    [existencia, id_producto, targetBodegaId]
  );
  return r.rows[0];
};

export const crearMovimientoStock = async ({
  id_producto,
  id_bodega = null,
  bodega_key = null,
  tipo,
  motivo = null,
  cantidad,
  nueva_existencia = null,
  id_usuario = null,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const targetBodegaId = await requireTargetBodegaForProducto({
      id_producto,
      id_bodega,
      bodega_key,
      executor: client,
    });

    // 1) Traer stock actual
    const rStock = await client.query(
      `SELECT existencia
       FROM "Stock_producto"
       WHERE id_producto = $1 AND id_bodega = $2
       FOR UPDATE`,
      [id_producto, targetBodegaId]
    );

    if (rStock.rowCount === 0) {
      throw new Error("No existe registro de stock para ese producto en esa bodega");
    }

    const existencia_antes = Number(rStock.rows[0].existencia);
    let existencia_despues = existencia_antes;

    // 2) Calcular existencia nueva
    if (tipo === "ENTRADA") {
      if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error("cantidad debe ser entero > 0");
      existencia_despues = existencia_antes + cantidad;
    } else if (tipo === "SALIDA") {
      if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error("cantidad debe ser entero > 0");
      if (existencia_antes - cantidad < 0) throw new Error("No hay stock suficiente para salida");
      existencia_despues = existencia_antes - cantidad;
    } else if (tipo === "AJUSTE") {
      if (!Number.isInteger(nueva_existencia) || nueva_existencia < 0)
        throw new Error("nueva_existencia debe ser entero >= 0");
      // cantidad en ajuste = diferencia absoluta (para registro)
      cantidad = Math.abs(nueva_existencia - existencia_antes);
      existencia_despues = nueva_existencia;
    } else {
      throw new Error("tipo inválido (ENTRADA|SALIDA|AJUSTE)");
    }

    // 3) Actualizar stock_producto
    const rUpdate = await client.query(
      `UPDATE "Stock_producto"
       SET existencia = $1
       WHERE id_producto = $2 AND id_bodega = $3
       RETURNING *`,
      [existencia_despues, id_producto, targetBodegaId]
    );

    // 4) Insertar movimiento
    const rMov = await client.query(
      `INSERT INTO "Movimiento_stock"
       (tipo, motivo, cantidad, existencia_antes, existencia_despues, id_producto, id_bodega, id_usuario)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [tipo, motivo, cantidad, existencia_antes, existencia_despues, id_producto, targetBodegaId, id_usuario]
    );

    await client.query("COMMIT");

    return {
      stock: rUpdate.rows[0],
      movimiento: rMov.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getMovimientosStock = async ({
  id_producto = null,
  id_bodega = null,
  bodega_key = null,
  tipo = null,
  desde = null,
  hasta = null,
  q = "",
  limit = 100,
} = {}) => {
  const resolvedBodegaId = await resolveLogicalBodegaId({ id_bodega, bodega_key });
  const values = [
    ...LOGICAL_BODEGA_NAMES,
    BODEGA_GENERAL_VISIBLE,
    BODEGA_TIENDA_TALLER_VISIBLE,
  ];
  const where = [`UPPER(TRIM(b."Nombre")) IN ($1, $2)`];
  let index = 5;

  if (resolvedBodegaId) {
    where.push(`ms.id_bodega = $${index}`);
    values.push(resolvedBodegaId);
    index++;
  }

  if (id_producto) {
    where.push(`ms.id_producto = $${index}`);
    values.push(id_producto);
    index++;
  }

  if (tipo && ["ENTRADA", "SALIDA", "AJUSTE"].includes(String(tipo).toUpperCase())) {
    where.push(`ms.tipo = $${index}`);
    values.push(String(tipo).toUpperCase());
    index++;
  }

  if (desde) {
    where.push(`ms.fecha::date >= $${index}::date`);
    values.push(desde);
    index++;
  }

  if (hasta) {
    where.push(`ms.fecha::date <= $${index}::date`);
    values.push(hasta);
    index++;
  }

  if (q) {
    where.push(`(
      COALESCE(p.nombre, '') ILIKE $${index}
      OR COALESCE(p.codigo_barras, '') ILIKE $${index}
      OR COALESCE(ms.motivo, '') ILIKE $${index}
      OR COALESCE(u.username, '') ILIKE $${index}
      OR COALESCE(u.nombre, '') ILIKE $${index}
    )`);
    values.push(`%${q}%`);
    index++;
  }

  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  values.push(normalizedLimit);

  const r = await pool.query(
    `
    SELECT
      ms.*,
      p.nombre AS producto_nombre,
      p.codigo_barras AS producto_codigo_barras,
      COALESCE(p.catalogo, 'GENERAL') AS producto_catalogo,
      p.descripcion AS producto_descripcion,
      CASE
        WHEN UPPER(TRIM(b."Nombre")) = $1 THEN $3
        ELSE $4
      END AS bodega_nombre_visible,
      COALESCE(u.nombre, u.username, 'Sistema') AS usuario_nombre,
      u.username AS usuario_username
    FROM "Movimiento_stock" ms
    LEFT JOIN "Producto" p
      ON p.id_producto = ms.id_producto
    LEFT JOIN "Bodega" b
      ON b."Id_bodega" = ms.id_bodega
    LEFT JOIN "Usuario" u
      ON u.id_usuario = ms.id_usuario
    WHERE ${where.join(" AND ")}
    ORDER BY ms.fecha DESC, ms.updated_at DESC, ms.id_producto ASC
    LIMIT $${index}
    `,
    values
  );

  return r.rows;
};

export const updateDatosStock = async ({
  id_producto,
  id_bodega = null,
  bodega_key = null,
  stock_minimo,
  ubicacion,
}) => {
  const targetBodegaId = await requireTargetBodegaForProducto({
    id_producto,
    id_bodega,
    bodega_key,
  });
  const fields = [];
  const values = [];
  let index = 1;

  if (stock_minimo !== undefined) {
    fields.push(`stock_minimo = $${index}`);
    values.push(stock_minimo);
    index++;
  }

  if (ubicacion !== undefined) {
    fields.push(`ubicacion = $${index}`);
    values.push(ubicacion);
    index++;
  }

  if (fields.length === 0) return null;

  values.push(id_producto);
  values.push(targetBodegaId);

  const query = `
    UPDATE "Stock_producto"
    SET ${fields.join(", ")}
    WHERE id_producto = $${index} AND id_bodega = $${index + 1}
    RETURNING *
  `;

  const r = await pool.query(query, values);
  return r.rows[0];
};
