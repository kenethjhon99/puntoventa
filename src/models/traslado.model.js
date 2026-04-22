import { pool } from "../config/db.js";

// ---------------------------------------------------------------------
// Traslados (historico, solo lectura desde Fase 4b.2).
//
// A partir de la consolidacion de stock a una sola bodega PRINCIPAL
// (Fase 4b.1) y del cierre de endpoints de creacion/anulacion
// (Fase 4b.2), el modelo expone unicamente lecturas:
//   - listarTraslados (paginado + filtros)
//   - getTrasladoCompleto (encabezado + detalles + kardex ligado)
//
// Columnas legacy: t.modulo_origen y t.modulo_destino fueron dropeadas
// en Fase 4b.3. Los nombres de bodega se leen directamente del JOIN
// con "Bodega" (bo / bd).
// ---------------------------------------------------------------------

const folioSql = `('T-' || LPAD(t.id_traslado::text, 5, '0'))`;
const trasladoCatalogLabelSql = (sourceSql) => `
  CASE
    WHEN UPPER(TRIM(COALESCE(${sourceSql}, ''))) IN ('GENERAL', 'PRINCIPAL') THEN 'General'
    WHEN UPPER(TRIM(COALESCE(${sourceSql}, ''))) IN ('TIENDA', 'TIENDA_TALLER', 'PRODUCTOS_TALLER', 'SERVICIOS', 'TALLER') THEN 'Tienda'
    ELSE ${sourceSql}
  END
`;

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
        bo."Nombre" AS bodega_origen_nombre,
        bd."Nombre" AS bodega_destino_nombre,
        ${trasladoCatalogLabelSql(`bo."Nombre"`)} AS origen_nombre_visible,
        ${trasladoCatalogLabelSql(`bd."Nombre"`)} AS destino_nombre_visible,
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
        bo."Nombre"    AS bodega_origen_nombre,
        bd."Nombre"    AS bodega_destino_nombre,
        ${trasladoCatalogLabelSql(`bo."Nombre"`)} AS origen_nombre_visible,
        ${trasladoCatalogLabelSql(`bd."Nombre"`)} AS destino_nombre_visible,
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
