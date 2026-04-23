import { pool } from "../config/db.js";
import {
  BODEGA_GENERAL,
  BODEGA_TIENDA_TALLER,
  getBodegaVisibleName,
  normalizeBodegaKey,
} from "../constants/inventory.js";
import {
  getBodegasLogicas,
} from "./bodega.model.js";

const folioSql = `('T-' || LPAD(t.id_traslado::text, 5, '0'))`;

const trasladoBodegaLabelSql = (sourceSql) => `
  CASE
    WHEN UPPER(TRIM(COALESCE(${sourceSql}, ''))) IN ('GENERAL', 'PRINCIPAL') THEN 'General'
    WHEN UPPER(TRIM(COALESCE(${sourceSql}, ''))) IN ('TIENDA', 'TIENDA_TALLER', 'PRODUCTOS_TALLER', 'SERVICIOS', 'TALLER') THEN 'Tienda / Productos Taller'
    ELSE ${sourceSql}
  END
`;

const ALLOWED_SORT = new Set([
  "id_traslado",
  "fecha",
  "estado",
  "total_unidades",
  "total_valorizado",
]);

const assertTrasladoPair = (origenKey, destinoKey) => {
  const origin = normalizeBodegaKey(origenKey);
  const destination = normalizeBodegaKey(destinoKey);

  const validPair =
    (origin === BODEGA_GENERAL && destination === BODEGA_TIENDA_TALLER) ||
    (origin === BODEGA_TIENDA_TALLER && destination === BODEGA_GENERAL);

  if (!validPair) {
    throw new Error(
      "Solo se permiten traslados entre General y Tienda / Productos Taller"
    );
  }
};

export const listarBodegasTraslado = async () => {
  const bodegas = await getBodegasLogicas();
  return bodegas.filter((bodega) =>
    [BODEGA_GENERAL, BODEGA_TIENDA_TALLER].includes(
      normalizeBodegaKey(bodega.bodega_key)
    )
  );
};

export const listarProductosBodegaOrigen = async (id_bodega, { q = "" } = {}) => {
  const resultBodega = await pool.query(
    `
      SELECT id_bodega, "Nombre" AS nombre
      FROM "Bodega"
      WHERE id_bodega = $1
      LIMIT 1
    `,
    [id_bodega]
  );

  const selected = resultBodega.rows[0];
  if (!selected) {
    throw new Error("Bodega origen no encontrada");
  }

  const bodegaKey = normalizeBodegaKey(selected.nombre);
  if (![BODEGA_GENERAL, BODEGA_TIENDA_TALLER].includes(bodegaKey)) {
    throw new Error("La bodega seleccionada no es valida para traslados");
  }

  const values = [Number(id_bodega)];
  let whereBusqueda = "";

  if (String(q || "").trim()) {
    values.push(`%${String(q).trim()}%`);
    whereBusqueda = `
      AND (
        p.nombre ILIKE $2
        OR COALESCE(p.codigo_barras, '') ILIKE $2
        OR COALESCE(p.descripcion, '') ILIKE $2
      )
    `;
  }

  const result = await pool.query(
    `
      SELECT
        p.id_producto,
        p.codigo_barras,
        p.nombre,
        p.descripcion,
        COALESCE(p.catalogo, 'GENERAL') AS catalogo,
        p.precio_compra,
        p.precio_venta,
        s.id_bodega,
        s.existencia,
        s.stock_minimo,
        s.ubicacion
      FROM "Producto" p
      INNER JOIN "Stock_producto" s
        ON s.id_producto = p.id_producto
       AND s.id_bodega = $1
      WHERE COALESCE(p.activo, true) = true
        AND COALESCE(s.existencia, 0) > 0
        ${whereBusqueda}
      ORDER BY p.nombre ASC
    `,
    values
  );

  return result.rows;
};

export const listarTraslados = async (filters = {}) => {
  const {
    desde,
    hasta,
    estado,
    id_bodega_origen,
    id_bodega_destino,
    id_usuario,
    id_producto,
    page = 1,
    limit = 20,
    sortBy = "fecha",
    sortDir = "desc",
  } = filters;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;
  const safeSortBy = ALLOWED_SORT.has(sortBy) ? sortBy : "fecha";
  const safeSortDir = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

  const where = [];
  const params = [];
  let i = 1;
  const estadoNormalizado = String(estado || "").trim().toUpperCase();

  if (desde) {
    where.push(`t.fecha >= $${i++}::timestamptz`);
    params.push(desde);
  }
  if (hasta) {
    where.push(`t.fecha < ($${i++}::date + interval '1 day')`);
    params.push(hasta);
  }
  if (estadoNormalizado && ["EN_TRANSITO", "RECIBIDO", "ANULADO"].includes(estadoNormalizado)) {
    where.push(`t.estado = $${i++}`);
    params.push(estadoNormalizado);
  }
  if (id_bodega_origen) {
    where.push(`t.id_bodega_origen = $${i++}`);
    params.push(Number(id_bodega_origen));
  }
  if (id_bodega_destino) {
    where.push(`t.id_bodega_destino = $${i++}`);
    params.push(Number(id_bodega_destino));
  }
  if (id_usuario) {
    where.push(`t.id_usuario = $${i++}`);
    params.push(Number(id_usuario));
  }
  if (id_producto) {
    where.push(`EXISTS (
      SELECT 1 FROM traslado_detalle td
      WHERE td.id_traslado = t.id_traslado AND td.id_producto = $${i++}
    )`);
    params.push(Number(id_producto));
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rCount = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM traslado t
     ${whereSql}`,
    params
  );
  const totalRows = rCount.rows[0]?.total ?? 0;
  const totalPages = Math.ceil(totalRows / safeLimit) || 0;

  const rData = await pool.query(
    `
      SELECT
        t.*,
        ${folioSql} AS folio,
        bo."Nombre" AS bodega_origen_nombre,
        bd."Nombre" AS bodega_destino_nombre,
        ${trasladoBodegaLabelSql(`bo."Nombre"`)} AS origen_nombre_visible,
        ${trasladoBodegaLabelSql(`bd."Nombre"`)} AS destino_nombre_visible,
        COALESCE(u.nombre, u.username, 'Sistema') AS usuario_nombre
      FROM traslado t
      LEFT JOIN "Bodega" bo ON bo.id_bodega = t.id_bodega_origen
      LEFT JOIN "Bodega" bd ON bd.id_bodega = t.id_bodega_destino
      LEFT JOIN "Usuario" u ON u.id_usuario = t.id_usuario
      ${whereSql}
      ORDER BY t.${safeSortBy} ${safeSortDir}, t.id_traslado DESC
      LIMIT $${i++} OFFSET $${i++}
    `,
    [...params, safeLimit, offset]
  );

  return {
    data: rData.rows,
    meta: {
      page: safePage,
      limit: safeLimit,
      totalRows,
      totalPages,
      sortBy: safeSortBy,
      sortDir: safeSortDir,
    },
  };
};

export const getTrasladoCompleto = async (id_traslado) => {
  const rT = await pool.query(
    `
      SELECT
        t.*,
        ${folioSql} AS folio,
        bo."Nombre" AS bodega_origen_nombre,
        bd."Nombre" AS bodega_destino_nombre,
        ${trasladoBodegaLabelSql(`bo."Nombre"`)} AS origen_nombre_visible,
        ${trasladoBodegaLabelSql(`bd."Nombre"`)} AS destino_nombre_visible,
        COALESCE(u.nombre, u.username, 'Sistema') AS usuario_nombre,
        ur.username AS usuario_recibe_username,
        ua.username AS anulada_por_username
      FROM traslado t
      LEFT JOIN "Bodega" bo ON bo.id_bodega = t.id_bodega_origen
      LEFT JOIN "Bodega" bd ON bd.id_bodega = t.id_bodega_destino
      LEFT JOIN "Usuario" u ON u.id_usuario = t.id_usuario
      LEFT JOIN "Usuario" ur ON ur.id_usuario = t.id_usuario_recibe
      LEFT JOIN "Usuario" ua ON ua.id_usuario = t.anulada_por
      WHERE t.id_traslado = $1
    `,
    [id_traslado]
  );

  const traslado = rT.rows[0];
  if (!traslado) return null;

  const rD = await pool.query(
    `
      SELECT
        d.*,
        TRIM(p.nombre) AS producto_nombre,
        p.codigo_barras
      FROM traslado_detalle d
      JOIN "Producto" p ON p.id_producto = d.id_producto
      WHERE d.id_traslado = $1
      ORDER BY d.id_traslado_detalle ASC
    `,
    [id_traslado]
  );

  const rM = await pool.query(
    `
      SELECT
        m.id_movimiento,
        m.fecha,
        m.tipo,
        m.motivo,
        m.cantidad,
        m.existencia_antes,
        m.existencia_despues,
        m.id_producto,
        m.id_bodega,
        ${trasladoBodegaLabelSql(`b."Nombre"`)} AS bodega_nombre
      FROM "Movimiento_stock" m
      LEFT JOIN "Bodega" b ON b.id_bodega = m.id_bodega
      WHERE m.id_traslado = $1
      ORDER BY m.id_movimiento ASC
    `,
    [id_traslado]
  );

  return {
    traslado,
    detalles: rD.rows,
    movimientos: rM.rows,
  };
};

export const crearTraslado = async ({
  id_bodega_origen,
  id_bodega_destino,
  motivo = null,
  observaciones = null,
  detalle = [],
  id_usuario,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const [origenResult, destinoResult] = await Promise.all([
      client.query(
        `SELECT id_bodega, "Nombre" AS nombre, id_sucursal FROM "Bodega" WHERE id_bodega = $1 LIMIT 1`,
        [id_bodega_origen]
      ),
      client.query(
        `SELECT id_bodega, "Nombre" AS nombre, id_sucursal FROM "Bodega" WHERE id_bodega = $1 LIMIT 1`,
        [id_bodega_destino]
      ),
    ]);

    const origen = origenResult.rows[0];
    const destino = destinoResult.rows[0];

    if (!origen || !destino) {
      throw new Error("Las bodegas seleccionadas no existen");
    }

    const originKey = normalizeBodegaKey(origen.nombre);
    const destinationKey = normalizeBodegaKey(destino.nombre);
    assertTrasladoPair(originKey, destinationKey);

    const detalleNormalizado = detalle.map((item) => ({
      id_producto: Number(item.id_producto),
      cantidad: Number(item.cantidad),
    }));

    let totalItems = 0;
    let totalUnidades = 0;
    let totalValorizado = 0;

    const trasladoResult = await client.query(
      `
        INSERT INTO traslado (
          id_bodega_origen,
          id_bodega_destino,
          id_sucursal_origen,
          id_sucursal_destino,
          id_usuario,
          estado,
          motivo,
          observaciones,
          total_items,
          total_unidades,
          total_valorizado
        )
        VALUES ($1, $2, $3, $4, $5, 'RECIBIDO', $6, $7, 0, 0, 0)
        RETURNING id_traslado, fecha
      `,
      [
        Number(id_bodega_origen),
        Number(id_bodega_destino),
        origen.id_sucursal,
        destino.id_sucursal,
        id_usuario,
        motivo,
        observaciones,
      ]
    );

    const traslado = trasladoResult.rows[0];

    for (const item of detalleNormalizado) {
      const productoResult = await client.query(
        `
          SELECT
            p.id_producto,
            p.nombre,
            COALESCE(p.catalogo, 'GENERAL') AS catalogo,
            COALESCE(p.precio_compra, 0) AS precio_compra,
            s.id_stock,
            s.existencia,
            s.stock_minimo,
            s.ubicacion
          FROM "Producto" p
          INNER JOIN "Stock_producto" s
            ON s.id_producto = p.id_producto
           AND s.id_bodega = $2
          WHERE p.id_producto = $1
            AND COALESCE(p.activo, true) = true
          FOR UPDATE OF s
        `,
        [item.id_producto, Number(id_bodega_origen)]
      );

      const producto = productoResult.rows[0];
      if (!producto) {
        throw new Error(`El producto ${item.id_producto} no existe en la bodega origen`);
      }

      const existenciaAntes = Number(producto.existencia || 0);
      if (existenciaAntes < item.cantidad) {
        throw new Error(
          `Stock insuficiente para "${producto.nombre}". Disponible: ${existenciaAntes}`
        );
      }

      const existenciaDespuesOrigen = existenciaAntes - item.cantidad;
      const costoUnitario = Number(producto.precio_compra || 0);
      const subtotal = Number((costoUnitario * item.cantidad).toFixed(2));

      await client.query(
        `
          INSERT INTO traslado_detalle (
            id_traslado,
            id_producto,
            cantidad,
            costo_unitario,
            subtotal
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [traslado.id_traslado, item.id_producto, item.cantidad, costoUnitario, subtotal]
      );

      await client.query(
        `
          UPDATE "Stock_producto"
          SET existencia = $1,
              updated_at = now(),
              updated_by = $4
          WHERE id_producto = $2
            AND id_bodega = $3
        `,
        [existenciaDespuesOrigen, item.id_producto, Number(id_bodega_origen), id_usuario]
      );

      const destinoStockResult = await client.query(
        `
          SELECT id_stock, existencia
          FROM "Stock_producto"
          WHERE id_producto = $1
            AND id_bodega = $2
          FOR UPDATE
        `,
        [item.id_producto, Number(id_bodega_destino)]
      );

      let existenciaAntesDestino = 0;
      let existenciaDespuesDestino = item.cantidad;

      if (destinoStockResult.rowCount === 0) {
        await client.query(
          `
            INSERT INTO "Stock_producto" (
              existencia,
              stock_minimo,
              ubicacion,
              id_producto,
              id_bodega,
              created_by,
              updated_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $6)
          `,
          [
            item.cantidad,
            Number(producto.stock_minimo || 0),
            producto.ubicacion || null,
            item.id_producto,
            Number(id_bodega_destino),
            id_usuario,
          ]
        );
      } else {
        existenciaAntesDestino = Number(destinoStockResult.rows[0].existencia || 0);
        existenciaDespuesDestino = existenciaAntesDestino + item.cantidad;

        await client.query(
          `
            UPDATE "Stock_producto"
            SET existencia = $1,
                updated_at = now(),
                updated_by = $4
            WHERE id_producto = $2
              AND id_bodega = $3
          `,
          [
            existenciaDespuesDestino,
            item.id_producto,
            Number(id_bodega_destino),
            id_usuario,
          ]
        );
      }

      await client.query(
        `
          INSERT INTO "Movimiento_stock"
            (tipo, motivo, cantidad, existencia_antes, existencia_despues, id_producto, id_bodega, id_usuario, id_traslado)
          VALUES
            ('SALIDA', $1, $2, $3, $4, $5, $6, $7, $8),
            ('ENTRADA', $9, $2, $10, $11, $5, $12, $7, $8)
        `,
        [
          `Traslado ${traslado.id_traslado}: ${getBodegaVisibleName(originKey)} -> ${getBodegaVisibleName(destinationKey)}`,
          item.cantidad,
          existenciaAntes,
          existenciaDespuesOrigen,
          item.id_producto,
          Number(id_bodega_origen),
          id_usuario,
          traslado.id_traslado,
          `Traslado ${traslado.id_traslado}: ${getBodegaVisibleName(originKey)} -> ${getBodegaVisibleName(destinationKey)}`,
          existenciaAntesDestino,
          existenciaDespuesDestino,
          Number(id_bodega_destino),
        ]
      );

      totalItems += 1;
      totalUnidades += item.cantidad;
      totalValorizado += subtotal;
    }

    await client.query(
      `
        UPDATE traslado
        SET total_items = $1,
            total_unidades = $2,
            total_valorizado = $3
        WHERE id_traslado = $4
      `,
      [
        totalItems,
        totalUnidades,
        Number(totalValorizado.toFixed(2)),
        traslado.id_traslado,
      ]
    );

    await client.query("COMMIT");

    return getTrasladoCompleto(traslado.id_traslado);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
