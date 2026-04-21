import { pool } from "../config/db.js";

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

const folioSql = `('T-' || LPAD(t.id_traslado::text, 5, '0'))`;
const GENERAL_BUCKET = "GENERAL";
const SERVICIOS_BUCKET = "SERVICIOS";

const normalizeBucketName = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

const getBucketFromBodegaName = (nombre) => {
  const normalized = normalizeBucketName(nombre);
  if (normalized === "GENERAL" || normalized === "BODEGA1") return GENERAL_BUCKET;
  if (["PRODUCTOS_TALLER", "TIENDA", "SERVICIOS", "TALLER"].includes(normalized)) {
    return SERVICIOS_BUCKET;
  }
  return null;
};

const getBucketLabel = (bucket) =>
  bucket === SERVICIOS_BUCKET ? "Productos Taller" : "General";

const getBucketByNameOrFallback = (bucketValue, bodegaNombre, fallback = GENERAL_BUCKET) =>
  normalizeBucketName(bucketValue) ||
  getBucketFromBodegaName(bodegaNombre) ||
  fallback;

const getBucketMeta = (row = {}) => {
  const bucket = row.bucket_key || getBucketFromBodegaName(row.nombre);
  return {
    ...row,
    bucket_key: bucket,
    nombre_visible: getBucketLabel(bucket),
  };
};

/**
 * Crear traslado (atomico) entre 2 bodegas.
 * Por cada item genera 2 movimientos de stock (SALIDA origen + ENTRADA destino)
 * ambos enlazados por id_traslado.
 *
 * Reglas:
 *  - bodega origen != destino
 *  - cantidad > 0 en cada item
 *  - no se permite dejar stock negativo en origen
 *  - costo_unitario se toma como snapshot de Producto.precio_compra
 *  - estado inicial: 'RECIBIDO' (confirmacion inmediata, flujo simple)
 */
export const crearTraslado = async ({
  fecha,
  id_bodega_origen,
  id_bodega_destino,
  id_usuario,
  motivo,
  observaciones,
  items,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const origenId = Number(id_bodega_origen);
    const destinoId = Number(id_bodega_destino);

    if (!Number.isInteger(origenId) || origenId <= 0) {
      throw new Error("id_bodega_origen invalido");
    }
    if (!Number.isInteger(destinoId) || destinoId <= 0) {
      throw new Error("id_bodega_destino invalido");
    }
    if (origenId === destinoId) {
      throw new Error("La bodega de origen y destino deben ser diferentes");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("items es requerido");
    }

    // 1) Validar bodegas y tomar sucursal
    const rBodegas = await client.query(
      `SELECT id_bodega, "Nombre" AS nombre, id_sucursal
       FROM "Bodega"
       WHERE id_bodega = ANY($1::int[])`,
      [[origenId, destinoId]]
    );
    if (rBodegas.rowCount < 2) {
      throw new Error("Alguna de las bodegas no existe");
    }
    const bOrigen = rBodegas.rows.find((b) => b.id_bodega === origenId);
    const bDestino = rBodegas.rows.find((b) => b.id_bodega === destinoId);
    if (!bOrigen || !bDestino) {
      throw new Error("Bodega origen o destino no encontrada");
    }

    const moduloOrigen = getBucketFromBodegaName(bOrigen.nombre);
    const moduloDestino = getBucketFromBodegaName(bDestino.nombre);

    if (!moduloOrigen || !moduloDestino) {
      throw new Error("Las bodegas de traslado deben ser General o Productos Taller");
    }
    if (moduloOrigen === moduloDestino) {
      throw new Error("El origen y destino deben pertenecer a modulos diferentes");
    }

    // 2) Consolidar items por id_producto (evita duplicados en el mismo traslado)
    const consolidado = new Map();
    for (const raw of items) {
      const idProd = Number(raw?.id_producto);
      const cant = Number(raw?.cantidad);
      if (!Number.isInteger(idProd) || idProd <= 0) {
        throw new Error("id_producto invalido en items");
      }
      if (!Number.isInteger(cant) || cant <= 0) {
        throw new Error("cantidad debe ser entero > 0 en items");
      }
      consolidado.set(idProd, (consolidado.get(idProd) || 0) + cant);
    }
    const itemsFinales = Array.from(consolidado.entries()).map(
      ([id_producto, cantidad]) => ({ id_producto, cantidad })
    );

    // 3) Crear encabezado (totales a 0, se actualizan al final)
    const rHead = await client.query(
      `INSERT INTO traslado(
          fecha,
          id_bodega_origen,
          id_bodega_destino,
          id_sucursal_origen,
          id_sucursal_destino,
          id_usuario,
          modulo_origen,
          modulo_destino,
          estado,
          motivo,
          observaciones,
          total_items,
          total_unidades,
          total_valorizado
        )
       VALUES (
          COALESCE($1::timestamptz, now()),
          $2, $3, $4, $5, $6,
          $7, $8,
          'RECIBIDO',
          $9, $10,
          0, 0, 0
       )
       RETURNING *`,
      [
        fecha ?? null,
        origenId,
        destinoId,
        bOrigen.id_sucursal ?? null,
        bDestino.id_sucursal ?? null,
        id_usuario,
        moduloOrigen,
        moduloDestino,
        motivo ? String(motivo).slice(0, 200) : null,
        observaciones ? String(observaciones).slice(0, 500) : null,
      ]
    );
    const traslado = rHead.rows[0];
    const id_traslado = traslado.id_traslado;

    let totalUnidades = 0;
    let totalValorizado = 0;

    // 4) Procesar renglones
    for (const it of itemsFinales) {
      // 4.1 Producto
      const rProd = await client.query(
        `SELECT id_producto, TRIM(nombre) AS nombre, precio_compra, activo
         FROM "Producto"
         WHERE id_producto = $1`,
        [it.id_producto]
      );
      if (rProd.rowCount === 0) {
        throw new Error(`Producto ${it.id_producto} no existe`);
      }
      const prod = rProd.rows[0];
      if (prod.activo === false) {
        throw new Error(`Producto inactivo: ${prod.nombre} (#${prod.id_producto})`);
      }

      const costo = round2(Number(prod.precio_compra) || 0);
      const subtotal = round2(costo * it.cantidad);
      totalUnidades += it.cantidad;
      totalValorizado += subtotal;

      // 4.2 Insertar detalle
      await client.query(
        `INSERT INTO traslado_detalle(
            id_traslado, id_producto, cantidad, costo_unitario, subtotal
         ) VALUES ($1,$2,$3,$4,$5)`,
        [id_traslado, it.id_producto, it.cantidad, costo, subtotal]
      );

      // 4.3 Lock stock origen
      const rStockOrig = await client.query(
        `SELECT id_stock, existencia
         FROM "Stock_producto"
         WHERE id_producto = $1 AND id_bodega = $2
         FOR UPDATE`,
        [it.id_producto, origenId]
      );

      const existenciaOrigen = rStockOrig.rowCount === 0
        ? 0
        : Number(rStockOrig.rows[0].existencia);

      if (existenciaOrigen < it.cantidad) {
        throw new Error(
          `Stock insuficiente en origen para ${prod.nombre} (#${prod.id_producto}). ` +
          `Disponible: ${existenciaOrigen}, solicitado: ${it.cantidad}`
        );
      }

      const nuevaExistenciaOrigen = existenciaOrigen - it.cantidad;

      await client.query(
        `UPDATE "Stock_producto"
         SET existencia = $1, updated_at = now()
         WHERE id_producto = $2 AND id_bodega = $3`,
        [nuevaExistenciaOrigen, it.id_producto, origenId]
      );

      // 4.4 Movimiento SALIDA origen (con link a traslado)
      await client.query(
        `INSERT INTO "Movimiento_stock"(
            tipo, motivo, cantidad,
            existencia_antes, existencia_despues,
            id_producto, id_bodega, id_usuario, id_traslado
         ) VALUES ('SALIDA', $1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `Traslado #${id_traslado} -> ${bDestino.nombre}`,
          it.cantidad,
          existenciaOrigen,
          nuevaExistenciaOrigen,
          it.id_producto,
          origenId,
          id_usuario,
          id_traslado,
        ]
      );

      // 4.5 Lock stock destino (crear si no existe)
      const rStockDest = await client.query(
        `SELECT id_stock, existencia
         FROM "Stock_producto"
         WHERE id_producto = $1 AND id_bodega = $2
         FOR UPDATE`,
        [it.id_producto, destinoId]
      );

      let existenciaDestino = 0;
      if (rStockDest.rowCount === 0) {
        await client.query(
          `INSERT INTO "Stock_producto"(id_producto, id_bodega, existencia, stock_minimo)
           VALUES ($1, $2, 0, 0)`,
          [it.id_producto, destinoId]
        );
      } else {
        existenciaDestino = Number(rStockDest.rows[0].existencia);
      }

      const nuevaExistenciaDestino = existenciaDestino + it.cantidad;

      await client.query(
        `UPDATE "Stock_producto"
         SET existencia = $1, updated_at = now()
         WHERE id_producto = $2 AND id_bodega = $3`,
        [nuevaExistenciaDestino, it.id_producto, destinoId]
      );

      // 4.6 Movimiento ENTRADA destino (con link a traslado)
      await client.query(
        `INSERT INTO "Movimiento_stock"(
            tipo, motivo, cantidad,
            existencia_antes, existencia_despues,
            id_producto, id_bodega, id_usuario, id_traslado
         ) VALUES ('ENTRADA', $1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `Traslado #${id_traslado} <- ${bOrigen.nombre}`,
          it.cantidad,
          existenciaDestino,
          nuevaExistenciaDestino,
          it.id_producto,
          destinoId,
          id_usuario,
          id_traslado,
        ]
      );

      if (nuevaExistenciaOrigen === 0 && moduloOrigen !== moduloDestino) {
        await client.query(
          `UPDATE "Producto"
           SET modulo_origen = $1,
               updated_at = now()
           WHERE id_producto = $2`,
          [moduloDestino, it.id_producto]
        );
      }
    }

    // 5) Actualizar totales del encabezado
    const rFinal = await client.query(
      `UPDATE traslado
       SET total_items = $1,
           total_unidades = $2,
           total_valorizado = $3,
           updated_at = now()
       WHERE id_traslado = $4
       RETURNING *`,
      [itemsFinales.length, totalUnidades, round2(totalValorizado), id_traslado]
    );

    await client.query("COMMIT");
    return rFinal.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

// ===================================================================
// Listar traslados (paginado + filtros)
// ===================================================================
const ALLOWED_SORT = new Set([
  "id_traslado",
  "fecha",
  "estado",
  "total_unidades",
  "total_valorizado",
]);

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
    `SELECT
        t.*,
        ${folioSql} AS folio,
        COALESCE(t.modulo_origen, '${GENERAL_BUCKET}') AS bucket_origen,
        COALESCE(t.modulo_destino, '${SERVICIOS_BUCKET}') AS bucket_destino,
        CASE
          WHEN COALESCE(t.modulo_origen, '${GENERAL_BUCKET}') = '${SERVICIOS_BUCKET}' THEN 'Productos Taller'
          ELSE 'General'
        END AS bodega_origen_nombre,
        CASE
          WHEN COALESCE(t.modulo_destino, '${SERVICIOS_BUCKET}') = '${SERVICIOS_BUCKET}' THEN 'Productos Taller'
          ELSE 'General'
        END AS bodega_destino_nombre,
        u.username  AS usuario_username,
        u.nombre    AS usuario_nombre,
        ur.username AS usuario_recibe_username,
        ua.username AS anulada_por_username
     FROM traslado t
     LEFT JOIN "Bodega"  bo ON bo.id_bodega  = t.id_bodega_origen
     LEFT JOIN "Bodega"  bd ON bd.id_bodega  = t.id_bodega_destino
     LEFT JOIN "Usuario" u  ON u.id_usuario  = t.id_usuario
     LEFT JOIN "Usuario" ur ON ur.id_usuario = t.id_usuario_recibe
     LEFT JOIN "Usuario" ua ON ua.id_usuario = t.anulada_por
     ${whereSql}
     ORDER BY t.${safeSortBy} ${safeSortDir}, t.id_traslado DESC
     LIMIT $${i++} OFFSET $${i++}`,
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

// ===================================================================
// Traslado completo (encabezado + detalles + movimientos)
// ===================================================================
export const getTrasladoCompleto = async (id_traslado) => {
  const rT = await pool.query(
    `SELECT
        t.*,
        ${folioSql} AS folio,
        COALESCE(t.modulo_origen, '${GENERAL_BUCKET}') AS bucket_origen,
        COALESCE(t.modulo_destino, '${SERVICIOS_BUCKET}') AS bucket_destino,
        CASE
          WHEN COALESCE(t.modulo_origen, '${GENERAL_BUCKET}') = '${SERVICIOS_BUCKET}' THEN 'Productos Taller'
          ELSE 'General'
        END AS bodega_origen_nombre,
        CASE
          WHEN COALESCE(t.modulo_destino, '${SERVICIOS_BUCKET}') = '${SERVICIOS_BUCKET}' THEN 'Productos Taller'
          ELSE 'General'
        END AS bodega_destino_nombre,
        so."Nombre"    AS sucursal_origen_nombre,
        so."Direccion" AS sucursal_origen_direccion,
        so."Telefono"  AS sucursal_origen_telefono,
        sd."Nombre"    AS sucursal_destino_nombre,
        sd."Direccion" AS sucursal_destino_direccion,
        sd."Telefono"  AS sucursal_destino_telefono,
        u.username   AS usuario_username,
        u.nombre     AS usuario_nombre,
        ur.username  AS usuario_recibe_username,
        ur.nombre    AS usuario_recibe_nombre,
        ua.username  AS anulada_por_username,
        ua.nombre    AS anulada_por_nombre
     FROM traslado t
     LEFT JOIN "Bodega"   bo ON bo.id_bodega   = t.id_bodega_origen
     LEFT JOIN "Bodega"   bd ON bd.id_bodega   = t.id_bodega_destino
     LEFT JOIN "Sucursal" so ON so."Id_sucursal" = t.id_sucursal_origen
     LEFT JOIN "Sucursal" sd ON sd."Id_sucursal" = t.id_sucursal_destino
     LEFT JOIN "Usuario"  u  ON u.id_usuario   = t.id_usuario
     LEFT JOIN "Usuario"  ur ON ur.id_usuario  = t.id_usuario_recibe
     LEFT JOIN "Usuario"  ua ON ua.id_usuario  = t.anulada_por
     WHERE t.id_traslado = $1`,
    [id_traslado]
  );

  const traslado = rT.rows[0];
  if (!traslado) return null;

  const rD = await pool.query(
    `SELECT
        d.*,
        TRIM(p.nombre) AS producto_nombre,
        p.codigo_barras
     FROM traslado_detalle d
     JOIN "Producto" p ON p.id_producto = d.id_producto
     WHERE d.id_traslado = $1
     ORDER BY d.id_traslado_detalle ASC`,
    [id_traslado]
  );

  const rM = await pool.query(
    `SELECT
        m.id_movimiento,
        m.fecha,
        m.tipo,
        m.motivo,
        m.cantidad,
        m.existencia_antes,
        m.existencia_despues,
        m.id_producto,
        m.id_bodega,
        b."Nombre" AS bodega_nombre
     FROM "Movimiento_stock" m
     LEFT JOIN "Bodega" b ON b.id_bodega = m.id_bodega
     WHERE m.id_traslado = $1
     ORDER BY m.id_movimiento ASC`,
    [id_traslado]
  );

  return {
    traslado,
    detalles: rD.rows,
    movimientos: rM.rows,
  };
};

// ===================================================================
// Anular traslado
//   - Reversa el stock: devuelve unidades a origen, descuenta en destino
//   - Falla si destino no tiene ya las unidades (se vendieron/consumieron)
//   - Genera 2 movimientos de reversa por renglon, ambos con id_traslado
// ===================================================================
export const anularTraslado = async ({ id_traslado, motivo, id_usuario }) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const rT = await client.query(
      `SELECT * FROM traslado
       WHERE id_traslado = $1
       FOR UPDATE`,
      [id_traslado]
    );
    if (rT.rowCount === 0) throw new Error("Traslado no encontrado");
    const t = rT.rows[0];
    if (String(t.estado).toUpperCase() === "ANULADO") {
      throw new Error("El traslado ya esta ANULADO");
    }

    const rDet = await client.query(
      `SELECT d.id_traslado_detalle, d.id_producto, d.cantidad,
              TRIM(p.nombre) AS producto_nombre
       FROM traslado_detalle d
       JOIN "Producto" p ON p.id_producto = d.id_producto
       WHERE d.id_traslado = $1
       ORDER BY d.id_traslado_detalle ASC`,
      [id_traslado]
    );

    const origenId = t.id_bodega_origen;
    const destinoId = t.id_bodega_destino;

    const rBodegas = await client.query(
      `SELECT id_bodega, "Nombre" AS nombre
       FROM "Bodega"
       WHERE id_bodega = ANY($1::int[])`,
      [[origenId, destinoId]]
    );
    const bOrigen = rBodegas.rows.find((b) => b.id_bodega === origenId);
    const bDestino = rBodegas.rows.find((b) => b.id_bodega === destinoId);
    const moduloOrigen = getBucketByNameOrFallback(
      t.modulo_origen,
      bOrigen?.nombre,
      GENERAL_BUCKET
    );
    const moduloDestino = getBucketByNameOrFallback(
      t.modulo_destino,
      bDestino?.nombre,
      SERVICIOS_BUCKET
    );

    for (const d of rDet.rows) {
      const cantidad = Number(d.cantidad);

      // Reversa en destino (SALIDA): quitar lo que habiamos agregado
      const rStockDest = await client.query(
        `SELECT existencia
         FROM "Stock_producto"
         WHERE id_producto = $1 AND id_bodega = $2
         FOR UPDATE`,
        [d.id_producto, destinoId]
      );
      if (rStockDest.rowCount === 0) {
        throw new Error(
          `No se puede anular: ${d.producto_nombre} no tiene stock en la bodega destino`
        );
      }
      const existDest = Number(rStockDest.rows[0].existencia);
      if (existDest < cantidad) {
        throw new Error(
          `No se puede anular: stock insuficiente en destino para ${d.producto_nombre}. ` +
          `Disponible: ${existDest}, requerido: ${cantidad}. Probablemente ya se vendio/consumio.`
        );
      }
      const nuevoDest = existDest - cantidad;

      await client.query(
        `UPDATE "Stock_producto"
         SET existencia = $1, updated_at = now()
         WHERE id_producto = $2 AND id_bodega = $3`,
        [nuevoDest, d.id_producto, destinoId]
      );

      await client.query(
        `INSERT INTO "Movimiento_stock"(
            tipo, motivo, cantidad,
            existencia_antes, existencia_despues,
            id_producto, id_bodega, id_usuario, id_traslado
         ) VALUES ('SALIDA', $1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `Anulacion traslado #${id_traslado}`,
          cantidad,
          existDest,
          nuevoDest,
          d.id_producto,
          destinoId,
          id_usuario,
          id_traslado,
        ]
      );

      if (nuevoDest === 0 && moduloOrigen !== moduloDestino) {
        await client.query(
          `UPDATE "Producto"
           SET modulo_origen = $1,
               updated_at = now()
           WHERE id_producto = $2`,
          [moduloOrigen, d.id_producto]
        );
      }

      // Reversa en origen (ENTRADA): devolver las unidades
      const rStockOrig = await client.query(
        `SELECT existencia
         FROM "Stock_producto"
         WHERE id_producto = $1 AND id_bodega = $2
         FOR UPDATE`,
        [d.id_producto, origenId]
      );

      let existOrig = 0;
      if (rStockOrig.rowCount === 0) {
        await client.query(
          `INSERT INTO "Stock_producto"(id_producto, id_bodega, existencia, stock_minimo)
           VALUES ($1, $2, 0, 0)`,
          [d.id_producto, origenId]
        );
      } else {
        existOrig = Number(rStockOrig.rows[0].existencia);
      }

      const nuevoOrig = existOrig + cantidad;

      await client.query(
        `UPDATE "Stock_producto"
         SET existencia = $1, updated_at = now()
         WHERE id_producto = $2 AND id_bodega = $3`,
        [nuevoOrig, d.id_producto, origenId]
      );

      await client.query(
        `INSERT INTO "Movimiento_stock"(
            tipo, motivo, cantidad,
            existencia_antes, existencia_despues,
            id_producto, id_bodega, id_usuario, id_traslado
         ) VALUES ('ENTRADA', $1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `Anulacion traslado #${id_traslado}`,
          cantidad,
          existOrig,
          nuevoOrig,
          d.id_producto,
          origenId,
          id_usuario,
          id_traslado,
        ]
      );
    }

    const rUpd = await client.query(
      `UPDATE traslado
       SET estado = 'ANULADO',
           anulada_en = now(),
           anulada_por = $1,
           motivo_anulacion = $2,
           updated_at = now()
       WHERE id_traslado = $3
       RETURNING *`,
      [id_usuario, motivo ? String(motivo).slice(0, 200) : null, id_traslado]
    );

    await client.query("COMMIT");
    return { ok: true, traslado: rUpd.rows[0] };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

// ===================================================================
// Bodegas auxiliares para el frontend (GENERAL / TIENDA y el resto)
// ===================================================================
export const listarBodegas = async () => {
  const r = await pool.query(
    `SELECT b.id_bodega,
            b."Nombre" AS nombre,
            b.id_sucursal,
            s."Nombre" AS sucursal_nombre,
            CASE
              WHEN UPPER(BTRIM(b."Nombre")) = 'GENERAL' THEN 'GENERAL'
              WHEN UPPER(BTRIM(b."Nombre")) IN ('PRODUCTOS_TALLER', 'TIENDA', 'SERVICIOS', 'TALLER') THEN 'SERVICIOS'
              ELSE NULL
            END AS bucket_key
     FROM "Bodega" b
     LEFT JOIN "Sucursal" s ON s."Id_sucursal" = b.id_sucursal
     WHERE UPPER(BTRIM(b."Nombre")) IN ('GENERAL', 'PRODUCTOS_TALLER', 'TIENDA', 'SERVICIOS', 'TALLER')
     ORDER BY
       CASE
         WHEN UPPER(BTRIM(b."Nombre")) = 'GENERAL' THEN 1
         WHEN UPPER(BTRIM(b."Nombre")) IN ('PRODUCTOS_TALLER', 'TIENDA', 'SERVICIOS', 'TALLER') THEN 2
         ELSE 99
       END,
       b."Nombre" ASC`
  );
  return r.rows
    .map(getBucketMeta)
    .filter((row) => row.bucket_key === GENERAL_BUCKET || row.bucket_key === SERVICIOS_BUCKET);
};

/**
 * Stock actual de todos los productos en una bodega (util para listar lo
 * "transferible" desde GENERAL). Devuelve solo productos activos con existencia>0.
 */
export const stockBodega = async (id_bodega) => {
  const rBodega = await pool.query(
    `SELECT id_bodega, "Nombre" AS nombre
     FROM "Bodega"
     WHERE id_bodega = $1`,
    [Number(id_bodega)]
  );

  const bodega = rBodega.rows[0];
  if (!bodega) {
    throw new Error("Bodega no encontrada");
  }

  const bucket = getBucketFromBodegaName(bodega.nombre);
  if (!bucket) {
    throw new Error("La bodega seleccionada no pertenece a General o Productos Taller");
  }

  // Mapeo de catalogo -> bucket del traslado:
  //   PRODUCTOS_TALLER -> SERVICIOS bucket (bodega Productos Taller)
  //   TIENDA / GENERAL -> GENERAL bucket (bodega General)
  // Usamos un CASE en SQL para derivar el bucket desde catalogo, ya que
  // la columna legacy p.modulo_origen fue dropeada en Fase 4a.
  const r = await pool.query(
    `SELECT
        p.id_producto,
        TRIM(p.nombre) AS nombre,
        p.codigo_barras,
        p.precio_compra,
        p.precio_venta,
        CASE
          WHEN COALESCE(p.catalogo, 'GENERAL') = 'PRODUCTOS_TALLER'
            THEN '${SERVICIOS_BUCKET}'
          ELSE '${GENERAL_BUCKET}'
        END AS modulo_origen,
        COALESCE(sp.existencia, 0) AS existencia
     FROM "Producto" p
     LEFT JOIN "Stock_producto" sp
            ON sp.id_producto = p.id_producto
           AND sp.id_bodega   = $1
     WHERE p.activo = true
       AND CASE
             WHEN COALESCE(p.catalogo, 'GENERAL') = 'PRODUCTOS_TALLER'
               THEN '${SERVICIOS_BUCKET}'
             ELSE '${GENERAL_BUCKET}'
           END = $2
     ORDER BY TRIM(p.nombre) ASC`,
    [Number(id_bodega), bucket]
  );
  return r.rows.map((row) => ({
    ...row,
    bucket_key: bucket,
    nombre_origen_visible: getBucketLabel(bucket),
  }));
};
