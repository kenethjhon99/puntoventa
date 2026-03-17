import { pool } from "../config/db.js";

export const corteVentas = async ({ desde, hasta, id_sucursal = 1, id_usuario = null }) => {
  const params = [desde, hasta, Number(id_sucursal)];
  let i = 4;
  let filtroUsuario = "";

  if (id_usuario) {
    filtroUsuario = `AND v.id_usuario = $${i++}`;
    params.push(Number(id_usuario));
  }

  // total neto por venta calculado desde detalle (considera cantidad_anulada)
  const sql = `
    WITH ventas_filtradas AS (
      SELECT v.id_venta, v.fecha, v.estado, v.tipo_venta, v.metodo_pago, v.id_sucursal, v.id_usuario
      FROM "Venta" v
      WHERE v.fecha >= $1::timestamptz
        AND v.fecha < ($2::date + interval '1 day')
        AND v.id_sucursal = $3
        ${filtroUsuario}
    ),
    totales_por_venta AS (
      SELECT
        d.id_venta,
        COALESCE(SUM((d.cantidad - d.cantidad_anulada) * d.precio_unitario), 0) AS total_neto,
        COALESCE(SUM(d.cantidad * d.precio_unitario), 0) AS total_original,
        COALESCE(SUM(d.cantidad_anulada * d.precio_unitario), 0) AS total_anulado
      FROM "Detalle_venta" d
      JOIN ventas_filtradas vf ON vf.id_venta = d.id_venta
      GROUP BY d.id_venta
    ),
    ventas_con_total AS (
      SELECT
        vf.*,
        tp.total_neto,
        tp.total_original,
        tp.total_anulado
      FROM ventas_filtradas vf
      LEFT JOIN totales_por_venta tp ON tp.id_venta = vf.id_venta
    )
    SELECT
      -- global
      COUNT(*)::int AS ventas_cantidad,
      COUNT(*) FILTER (WHERE estado = 'ANULADA')::int AS ventas_anuladas,
      COALESCE(SUM(total_neto),0) AS total_neto,
      COALESCE(SUM(total_original),0) AS total_original,
      COALESCE(SUM(total_anulado),0) AS total_anulado,

      -- por método de pago (neto)
      COALESCE(SUM(total_neto) FILTER (WHERE metodo_pago = 'EFECTIVO'),0) AS total_efectivo,
      COALESCE(SUM(total_neto) FILTER (WHERE metodo_pago = 'TARJETA'),0) AS total_tarjeta,
      COALESCE(SUM(total_neto) FILTER (WHERE metodo_pago = 'TRANSFERENCIA'),0) AS total_transferencia,

      -- por tipo de venta (neto)
      COALESCE(SUM(total_neto) FILTER (WHERE tipo_venta = 'CONTADO'),0) AS total_contado,
      COALESCE(SUM(total_neto) FILTER (WHERE tipo_venta = 'CREDITO'),0) AS total_credito
    FROM ventas_con_total;
  `;

  const rResumen = await pool.query(sql, params);

  // resumen por usuario (para auditoría)
  const sqlUsuarios = `
    WITH ventas_filtradas AS (
      SELECT v.id_venta, v.id_usuario
      FROM "Venta" v
      WHERE v.fecha >= $1::timestamptz
        AND v.fecha < ($2::date + interval '1 day')
        AND v.id_sucursal = $3
        ${filtroUsuario}
    ),
    totales_por_venta AS (
      SELECT d.id_venta, COALESCE(SUM((d.cantidad - d.cantidad_anulada) * d.precio_unitario),0) AS total_neto
      FROM "Detalle_venta" d
      JOIN ventas_filtradas vf ON vf.id_venta = d.id_venta
      GROUP BY d.id_venta
    )
    SELECT
      u.id_usuario,
      u.username,
      u.nombre,
      COUNT(vf.id_venta)::int AS ventas,
      COALESCE(SUM(tp.total_neto),0) AS total_neto
    FROM ventas_filtradas vf
    JOIN "Usuario" u ON u.id_usuario = vf.id_usuario
    LEFT JOIN totales_por_venta tp ON tp.id_venta = vf.id_venta
    GROUP BY u.id_usuario, u.username, u.nombre
    ORDER BY total_neto DESC;
  `;

  const rUsuarios = await pool.query(sqlUsuarios, params);

  return {
    rango: { desde, hasta, id_sucursal: Number(id_sucursal), id_usuario: id_usuario ? Number(id_usuario) : null },
    resumen: rResumen.rows[0],
    por_usuario: rUsuarios.rows
  };
};


export const corteVentasDetalladoPro = async ({
  desde,
  hasta,
  id_sucursal = 1,
  id_usuario = null,
  page = 1,
  limit = 50,
  top = 10,
}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const offset = (safePage - 1) * safeLimit;
  const safeTop = Math.min(50, Math.max(1, Number(top) || 10));

  const paramsBase = [desde, hasta, Number(id_sucursal)];
  let filtroUsuario = "";
  if (id_usuario) {
    filtroUsuario = `AND v.id_usuario = $4`;
    paramsBase.push(Number(id_usuario));
  }

  // ===== RESUMEN GLOBAL =====
  const rResumen = await pool.query(
    `
    WITH ventas_filtradas AS (
      SELECT v.*
      FROM "Venta" v
      WHERE v.fecha >= $1::timestamptz
        AND v.fecha < ($2::date + interval '1 day')
        AND v.id_sucursal = $3
        ${filtroUsuario}
    ),
    totales_por_venta AS (
      SELECT d.id_venta,
             COALESCE(SUM((d.cantidad - d.cantidad_anulada) * d.precio_unitario),0) AS total_neto,
             COALESCE(SUM(d.cantidad * d.precio_unitario),0) AS total_original,
             COALESCE(SUM(d.cantidad_anulada * d.precio_unitario),0) AS total_anulado
      FROM "Detalle_venta" d
      JOIN ventas_filtradas v ON v.id_venta = d.id_venta
      GROUP BY d.id_venta
    ),
    ventas_con_total AS (
      SELECT v.*,
             tp.total_neto, tp.total_original, tp.total_anulado
      FROM ventas_filtradas v
      LEFT JOIN totales_por_venta tp ON tp.id_venta = v.id_venta
    )
    SELECT
      COUNT(*)::int AS ventas_cantidad,
      COUNT(*) FILTER (WHERE estado = 'ANULADA')::int AS ventas_anuladas,
      COALESCE(SUM(total_neto),0) AS total_neto,
      COALESCE(SUM(total_original),0) AS total_original,
      COALESCE(SUM(total_anulado),0) AS total_anulado
    FROM ventas_con_total;
    `,
    paramsBase
  );

  // ===== PAGINACIÓN =====
  const rCount = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM "Venta" v
    WHERE v.fecha >= $1::timestamptz
      AND v.fecha < ($2::date + interval '1 day')
      AND v.id_sucursal = $3
      ${filtroUsuario}
    `,
    paramsBase
  );
  const totalRows = rCount.rows[0]?.total ?? 0;
  const totalPages = Math.ceil(totalRows / safeLimit);

  // ===== LISTA DE VENTAS CON TOTAL NETO =====
  const paramsVentas = [...paramsBase, safeLimit, offset];
  const rVentas = await pool.query(
    `
    WITH ventas_filtradas AS (
      SELECT v.*
      FROM "Venta" v
      WHERE v.fecha >= $1::timestamptz
        AND v.fecha < ($2::date + interval '1 day')
        AND v.id_sucursal = $3
        ${filtroUsuario}
      ORDER BY v.fecha DESC
      LIMIT $${paramsBase.length + 1} OFFSET $${paramsBase.length + 2}
    ),
    totales_por_venta AS (
      SELECT d.id_venta,
             COALESCE(SUM((d.cantidad - d.cantidad_anulada) * d.precio_unitario),0) AS total_neto,
             COALESCE(SUM(d.cantidad_anulada * d.precio_unitario),0) AS total_anulado
      FROM "Detalle_venta" d
      JOIN ventas_filtradas v ON v.id_venta = d.id_venta
      GROUP BY d.id_venta
    )
    SELECT
      v.id_venta, v.fecha, v.estado, v.tipo_venta, v.metodo_pago, v.id_sucursal,
      v.id_usuario, u.username AS usuario_username, u.nombre AS usuario_nombre,
      COALESCE(tp.total_neto,0) AS total_neto,
      COALESCE(tp.total_anulado,0) AS total_anulado
    FROM ventas_filtradas v
    JOIN "Usuario" u ON u.id_usuario = v.id_usuario
    LEFT JOIN totales_por_venta tp ON tp.id_venta = v.id_venta
    ORDER BY v.fecha DESC;
    `,
    paramsVentas
  );

  // ===== POR USUARIO (NETO) =====
  const rPorUsuario = await pool.query(
    `
    WITH ventas_filtradas AS (
      SELECT v.id_venta, v.id_usuario
      FROM "Venta" v
      WHERE v.fecha >= $1::timestamptz
        AND v.fecha < ($2::date + interval '1 day')
        AND v.id_sucursal = $3
        ${filtroUsuario}
    ),
    totales_por_venta AS (
      SELECT d.id_venta,
             COALESCE(SUM((d.cantidad - d.cantidad_anulada) * d.precio_unitario),0) AS total_neto
      FROM "Detalle_venta" d
      JOIN ventas_filtradas v ON v.id_venta = d.id_venta
      GROUP BY d.id_venta
    )
    SELECT
      u.id_usuario, u.username, u.nombre,
      COUNT(vf.id_venta)::int AS ventas,
      COALESCE(SUM(tp.total_neto),0) AS total_neto
    FROM ventas_filtradas vf
    JOIN "Usuario" u ON u.id_usuario = vf.id_usuario
    LEFT JOIN totales_por_venta tp ON tp.id_venta = vf.id_venta
    GROUP BY u.id_usuario, u.username, u.nombre
    ORDER BY total_neto DESC;
    `,
    paramsBase
  );

  // ===== POR MÉTODO DE PAGO (DINÁMICO) =====
  const rPorMetodo = await pool.query(
    `
    WITH ventas_filtradas AS (
      SELECT v.id_venta, v.metodo_pago
      FROM "Venta" v
      WHERE v.fecha >= $1::timestamptz
        AND v.fecha < ($2::date + interval '1 day')
        AND v.id_sucursal = $3
        ${filtroUsuario}
    ),
    totales_por_venta AS (
      SELECT d.id_venta,
             COALESCE(SUM((d.cantidad - d.cantidad_anulada) * d.precio_unitario),0) AS total_neto
      FROM "Detalle_venta" d
      JOIN ventas_filtradas v ON v.id_venta = d.id_venta
      GROUP BY d.id_venta
    )
    SELECT
      vf.metodo_pago,
      COUNT(vf.id_venta)::int AS ventas,
      COALESCE(SUM(tp.total_neto),0) AS total_neto
    FROM ventas_filtradas vf
    LEFT JOIN totales_por_venta tp ON tp.id_venta = vf.id_venta
    GROUP BY vf.metodo_pago
    ORDER BY total_neto DESC;
    `,
    paramsBase
  );

  // ===== POR TIPO DE VENTA (DINÁMICO) =====
  const rPorTipo = await pool.query(
    `
    WITH ventas_filtradas AS (
      SELECT v.id_venta, v.tipo_venta
      FROM "Venta" v
      WHERE v.fecha >= $1::timestamptz
        AND v.fecha < ($2::date + interval '1 day')
        AND v.id_sucursal = $3
        ${filtroUsuario}
    ),
    totales_por_venta AS (
      SELECT d.id_venta,
             COALESCE(SUM((d.cantidad - d.cantidad_anulada) * d.precio_unitario),0) AS total_neto
      FROM "Detalle_venta" d
      JOIN ventas_filtradas v ON v.id_venta = d.id_venta
      GROUP BY d.id_venta
    )
    SELECT
      vf.tipo_venta,
      COUNT(vf.id_venta)::int AS ventas,
      COALESCE(SUM(tp.total_neto),0) AS total_neto
    FROM ventas_filtradas vf
    LEFT JOIN totales_por_venta tp ON tp.id_venta = vf.id_venta
    GROUP BY vf.tipo_venta
    ORDER BY total_neto DESC;
    `,
    paramsBase
  );

  // ===== TOP PRODUCTOS POR TOTAL (NETO) =====
  const paramsTop = [...paramsBase, safeTop];
  const rTopTotal = await pool.query(
    `
    WITH ventas_filtradas AS (
      SELECT v.id_venta
      FROM "Venta" v
      WHERE v.fecha >= $1::timestamptz
        AND v.fecha < ($2::date + interval '1 day')
        AND v.id_sucursal = $3
        ${filtroUsuario}
    )
    SELECT
      p.id_producto,
      p.nombre AS producto_nombre,
      p.codigo_barras,
      COALESCE(SUM(d.cantidad - d.cantidad_anulada),0)::int AS cantidad_vendida_neta,
      COALESCE(SUM((d.cantidad - d.cantidad_anulada) * d.precio_unitario),0) AS total_neto
    FROM "Detalle_venta" d
    JOIN ventas_filtradas vf ON vf.id_venta = d.id_venta
    JOIN "Producto" p ON p.id_producto = d.id_producto
    GROUP BY p.id_producto, p.nombre, p.codigo_barras
    ORDER BY total_neto DESC
    LIMIT $${paramsBase.length + 1};
    `,
    paramsTop
  );

  // ===== TOP PRODUCTOS POR CANTIDAD (NETO) =====
  const rTopCantidad = await pool.query(
    `
    WITH ventas_filtradas AS (
      SELECT v.id_venta
      FROM "Venta" v
      WHERE v.fecha >= $1::timestamptz
        AND v.fecha < ($2::date + interval '1 day')
        AND v.id_sucursal = $3
        ${filtroUsuario}
    )
    SELECT
      p.id_producto,
      p.nombre AS producto_nombre,
      p.codigo_barras,
      COALESCE(SUM(d.cantidad - d.cantidad_anulada),0)::int AS cantidad_vendida_neta,
      COALESCE(SUM((d.cantidad - d.cantidad_anulada) * d.precio_unitario),0) AS total_neto
    FROM "Detalle_venta" d
    JOIN ventas_filtradas vf ON vf.id_venta = d.id_venta
    JOIN "Producto" p ON p.id_producto = d.id_producto
    GROUP BY p.id_producto, p.nombre, p.codigo_barras
    ORDER BY cantidad_vendida_neta DESC, total_neto DESC
    LIMIT $${paramsBase.length + 1};
    `,
    paramsTop
  );

  return {
    rango: {
      desde,
      hasta,
      id_sucursal: Number(id_sucursal),
      id_usuario: id_usuario ? Number(id_usuario) : null,
    },
    resumen: rResumen.rows[0],
    ventas: rVentas.rows,
    por_usuario: rPorUsuario.rows,
    por_metodo_pago: rPorMetodo.rows,
    por_tipo_venta: rPorTipo.rows,
    top_productos_por_total: rTopTotal.rows,
    top_productos_por_cantidad: rTopCantidad.rows,
    meta: { page: safePage, limit: safeLimit, totalRows, totalPages, top: safeTop },
  };
};