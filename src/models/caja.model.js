import { pool } from "../config/db.js";

const toNumber = (value) => Number(Number(value || 0).toFixed(2));

export const getCajaSesionActiva = async (id_usuario) => {
  const result = await pool.query(
    `
      SELECT
        cs.*,
        u.username,
        u.nombre
      FROM "Caja_sesion" cs
      JOIN "Usuario" u ON u.id_usuario = cs.id_usuario
      WHERE cs.id_usuario = $1
        AND cs.estado = 'ABIERTA'
      ORDER BY cs.fecha_apertura DESC
      LIMIT 1
    `,
    [Number(id_usuario)]
  );

  return result.rows[0] || null;
};

export const getCajaSesionById = async (id_caja_sesion) => {
  const result = await pool.query(
    `
      SELECT
        cs.*,
        u.username,
        u.nombre
      FROM "Caja_sesion" cs
      JOIN "Usuario" u ON u.id_usuario = cs.id_usuario
      WHERE cs.id_caja_sesion = $1
      LIMIT 1
    `,
    [Number(id_caja_sesion)]
  );

  return result.rows[0] || null;
};

export const abrirCaja = async ({
  id_usuario,
  id_sucursal = 1,
  monto_apertura,
  observaciones_apertura,
}) => {
  const existente = await getCajaSesionActiva(id_usuario);
  if (existente) {
    throw new Error("Ya existe una caja abierta para este usuario");
  }

  const monto = Number(monto_apertura);
  if (!Number.isFinite(monto) || monto < 0) {
    throw new Error("monto_apertura debe ser un numero mayor o igual a 0");
  }

  const result = await pool.query(
    `
      INSERT INTO "Caja_sesion" (
        id_usuario,
        id_sucursal,
        monto_apertura,
        observaciones_apertura,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $1, $1)
      RETURNING *
    `,
    [
      Number(id_usuario),
      Number(id_sucursal || 1),
      toNumber(monto),
      observaciones_apertura || null,
    ]
  );

  return result.rows[0];
};

export const listarSesionesCaja = async ({
  id_usuario = null,
  estado = "TODOS",
  q = "",
  page = 1,
  limit = 10,
}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));
  const offset = (safePage - 1) * safeLimit;
  const params = [];
  const where = [];
  let index = 1;

  if (id_usuario) {
    where.push(`cs.id_usuario = $${index++}`);
    params.push(Number(id_usuario));
  }

  const queryText = String(q || "").trim();
  if (queryText) {
    where.push(`(u.username ILIKE $${index} OR COALESCE(u.nombre, '') ILIKE $${index})`);
    params.push(`%${queryText}%`);
    index += 1;
  }

  const estadoNormalizado = String(estado || "TODOS").trim().toUpperCase();
  if (estadoNormalizado === "ABIERTA" || estadoNormalizado === "CERRADA") {
    where.push(`cs.estado = $${index++}`);
    params.push(estadoNormalizado);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM "Caja_sesion" cs
      JOIN "Usuario" u ON u.id_usuario = cs.id_usuario
      ${whereSql}
    `,
    params
  );

  const dataResult = await pool.query(
    `
      SELECT
        cs.*,
        u.username,
        u.nombre,
        COALESCE(m.total_ingresos, 0) AS total_ingresos,
        COALESCE(m.total_egresos, 0) AS total_egresos,
        COALESCE(m.movimientos, 0) AS movimientos
      FROM "Caja_sesion" cs
      JOIN "Usuario" u ON u.id_usuario = cs.id_usuario
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS movimientos,
          COALESCE(SUM(monto) FILTER (WHERE tipo = 'INGRESO'), 0) AS total_ingresos,
          COALESCE(SUM(monto) FILTER (WHERE tipo = 'EGRESO'), 0) AS total_egresos
        FROM "Caja_movimiento"
        WHERE id_caja_sesion = cs.id_caja_sesion
      ) m ON true
      ${whereSql}
      ORDER BY cs.fecha_apertura DESC
      LIMIT $${index++} OFFSET $${index++}
    `,
    [...params, safeLimit, offset]
  );

  const totalRows = countResult.rows[0]?.total ?? 0;

  return {
    data: dataResult.rows,
    meta: {
      page: safePage,
      limit: safeLimit,
      totalRows,
      totalPages: Math.ceil(totalRows / safeLimit),
      estado: estadoNormalizado,
      q: queryText,
    },
  };
};

export const getCajaMovimientos = async (id_caja_sesion) => {
  const result = await pool.query(
    `
      SELECT
        cm.*,
        u.username,
        u.nombre
      FROM "Caja_movimiento" cm
      JOIN "Usuario" u ON u.id_usuario = cm.id_usuario
      WHERE cm.id_caja_sesion = $1
      ORDER BY cm.fecha DESC, cm.id_caja_movimiento DESC
    `,
    [Number(id_caja_sesion)]
  );

  return result.rows;
};

export const getCajaResumen = async (id_caja_sesion) => {
  const sesion = await getCajaSesionById(id_caja_sesion);
  if (!sesion) {
    throw new Error("Sesion de caja no encontrada");
  }

  const fechaFin = sesion.fecha_cierre || new Date().toISOString();

  const movimientosResult = await pool.query(
    `
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE tipo = 'INGRESO'), 0) AS ingresos,
        COALESCE(SUM(monto) FILTER (WHERE tipo = 'EGRESO'), 0) AS egresos,
        COUNT(*)::int AS movimientos
      FROM "Caja_movimiento"
      WHERE id_caja_sesion = $1
    `,
    [Number(id_caja_sesion)]
  );

  const ventasResult = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE estado <> 'ANULADA')::int AS ventas_cantidad,
        COUNT(*) FILTER (WHERE estado = 'ANULADA')::int AS ventas_anuladas,
        COALESCE(SUM(total) FILTER (WHERE estado <> 'ANULADA'), 0) AS total_neto,
        COALESCE(SUM(total) FILTER (WHERE estado <> 'ANULADA' AND metodo_pago = 'EFECTIVO'), 0) AS total_efectivo,
        COALESCE(SUM(total) FILTER (WHERE estado <> 'ANULADA' AND metodo_pago = 'TARJETA'), 0) AS total_tarjeta,
        COALESCE(SUM(total) FILTER (WHERE estado <> 'ANULADA' AND metodo_pago = 'TRANSFERENCIA'), 0) AS total_transferencia,
        COALESCE(SUM(total) FILTER (WHERE estado <> 'ANULADA' AND tipo_venta = 'CREDITO'), 0) AS total_credito
      FROM "Venta"
      WHERE id_usuario = $1
        AND id_sucursal = $2
        AND fecha >= $3
        AND fecha <= $4
    `,
    [
      Number(sesion.id_usuario),
      Number(sesion.id_sucursal),
      sesion.fecha_apertura,
      fechaFin,
    ]
  );

  const serviciosResult = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE estado = 'PAGADO')::int AS servicios_cantidad,
        COALESCE(SUM(monto_cobrado) FILTER (WHERE estado = 'PAGADO'), 0) AS total_servicios,
        COALESCE(SUM(monto_cobrado) FILTER (WHERE estado = 'PAGADO' AND metodo_pago = 'EFECTIVO'), 0) AS total_servicios_efectivo,
        COALESCE(SUM(monto_cobrado) FILTER (WHERE estado = 'PAGADO' AND metodo_pago = 'TARJETA'), 0) AS total_servicios_tarjeta,
        COALESCE(SUM(monto_cobrado) FILTER (WHERE estado = 'PAGADO' AND metodo_pago = 'TRANSFERENCIA'), 0) AS total_servicios_transferencia
      FROM "Autolavado_orden"
      WHERE id_caja_sesion = $1
    `,
    [Number(id_caja_sesion)]
  );

  const reparacionesResult = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE estado = 'PAGADO')::int AS reparaciones_cantidad,
        COALESCE(SUM(monto_cobrado) FILTER (WHERE estado = 'PAGADO'), 0) AS total_reparaciones,
        COALESCE(SUM(monto_cobrado) FILTER (WHERE estado = 'PAGADO' AND metodo_pago = 'EFECTIVO'), 0) AS total_reparaciones_efectivo,
        COALESCE(SUM(monto_cobrado) FILTER (WHERE estado = 'PAGADO' AND metodo_pago = 'TARJETA'), 0) AS total_reparaciones_tarjeta,
        COALESCE(SUM(monto_cobrado) FILTER (WHERE estado = 'PAGADO' AND metodo_pago = 'TRANSFERENCIA'), 0) AS total_reparaciones_transferencia
      FROM "Reparacion_orden"
      WHERE id_caja_sesion = $1
    `,
    [Number(id_caja_sesion)]
  );

  const gastosCategoriaResult = await pool.query(
    `
      SELECT
        COALESCE(NULLIF(TRIM(categoria), ''), 'SIN_CATEGORIA') AS categoria,
        COUNT(*)::int AS cantidad,
        COALESCE(SUM(monto), 0) AS total
      FROM "Caja_movimiento"
      WHERE id_caja_sesion = $1
        AND tipo = 'EGRESO'
      GROUP BY COALESCE(NULLIF(TRIM(categoria), ''), 'SIN_CATEGORIA')
      ORDER BY COALESCE(SUM(monto), 0) DESC, categoria ASC
    `,
    [Number(id_caja_sesion)]
  );

  const movimientos = movimientosResult.rows[0] || {};
  const ventas = ventasResult.rows[0] || {};
  const servicios = serviciosResult.rows[0] || {};
  const reparaciones = reparacionesResult.rows[0] || {};

  const montoApertura = toNumber(sesion.monto_apertura);
  const ingresos = toNumber(movimientos.ingresos);
  const egresos = toNumber(movimientos.egresos);
  const totalEfectivo = toNumber(ventas.total_efectivo);
  const totalServiciosEfectivo = toNumber(servicios.total_servicios_efectivo);
  const totalReparacionesEfectivo = toNumber(reparaciones.total_reparaciones_efectivo);
  const totalTarjeta =
    toNumber(ventas.total_tarjeta) +
    toNumber(servicios.total_servicios_tarjeta) +
    toNumber(reparaciones.total_reparaciones_tarjeta);
  const totalTransferencia =
    toNumber(ventas.total_transferencia) +
    toNumber(servicios.total_servicios_transferencia) +
    toNumber(reparaciones.total_reparaciones_transferencia);
  const cierreCalculado = toNumber(
    montoApertura +
      totalEfectivo +
      totalServiciosEfectivo +
      totalReparacionesEfectivo +
      ingresos -
      egresos
  );

  return {
    sesion,
    resumen: {
      monto_apertura: montoApertura,
      total_efectivo: totalEfectivo,
      total_servicios: toNumber(servicios.total_servicios),
      total_servicios_efectivo: totalServiciosEfectivo,
      total_servicios_tarjeta: toNumber(servicios.total_servicios_tarjeta),
      total_servicios_transferencia: toNumber(servicios.total_servicios_transferencia),
      servicios_cantidad: Number(servicios.servicios_cantidad || 0),
      total_reparaciones: toNumber(reparaciones.total_reparaciones),
      total_reparaciones_efectivo: totalReparacionesEfectivo,
      total_reparaciones_tarjeta: toNumber(reparaciones.total_reparaciones_tarjeta),
      total_reparaciones_transferencia: toNumber(reparaciones.total_reparaciones_transferencia),
      reparaciones_cantidad: Number(reparaciones.reparaciones_cantidad || 0),
      total_tarjeta: totalTarjeta,
      total_transferencia: totalTransferencia,
      total_credito: toNumber(ventas.total_credito),
      total_neto_ventas: toNumber(ventas.total_neto),
      ventas_cantidad: Number(ventas.ventas_cantidad || 0),
      ventas_anuladas: Number(ventas.ventas_anuladas || 0),
      ingresos_manuales: ingresos,
      egresos_manuales: egresos,
      movimientos_manuales: Number(movimientos.movimientos || 0),
      gastos_por_categoria: gastosCategoriaResult.rows.map((item) => ({
        categoria: item.categoria,
        cantidad: Number(item.cantidad || 0),
        total: toNumber(item.total),
      })),
      conciliacion: {
        efectivo_sistema: cierreCalculado,
        efectivo_reportado:
          sesion.monto_cierre_reportado != null
            ? toNumber(sesion.monto_cierre_reportado)
            : null,
        diferencia_efectivo:
          sesion.diferencia != null ? toNumber(sesion.diferencia) : null,
        total_tarjeta: totalTarjeta,
        total_transferencia: totalTransferencia,
        total_credito: toNumber(ventas.total_credito),
        total_no_efectivo: toNumber(totalTarjeta + totalTransferencia),
      },
      cierre_calculado: cierreCalculado,
      monto_cierre_reportado: sesion.monto_cierre_reportado != null ? toNumber(sesion.monto_cierre_reportado) : null,
      diferencia: sesion.diferencia != null ? toNumber(sesion.diferencia) : null,
    },
    movimientos: await getCajaMovimientos(id_caja_sesion),
  };
};

export const registrarMovimientoCaja = async ({
  id_caja_sesion,
  id_usuario,
  tipo,
  categoria,
  monto,
  descripcion,
}) => {
  const sesion = await getCajaSesionById(id_caja_sesion);
  if (!sesion || sesion.estado !== "ABIERTA") {
    throw new Error("La caja indicada no esta abierta");
  }

  const tipoNormalizado = String(tipo || "").trim().toUpperCase();
  if (!["INGRESO", "EGRESO"].includes(tipoNormalizado)) {
    throw new Error("tipo debe ser INGRESO o EGRESO");
  }

  const montoNormalizado = Number(monto);
  if (!Number.isFinite(montoNormalizado) || montoNormalizado <= 0) {
    throw new Error("monto debe ser un numero mayor a 0");
  }

  const result = await pool.query(
    `
      INSERT INTO "Caja_movimiento" (
        id_caja_sesion,
        id_usuario,
        tipo,
        categoria,
        monto,
        descripcion,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $2, $2)
      RETURNING *
    `,
    [
      Number(id_caja_sesion),
      Number(id_usuario),
      tipoNormalizado,
      categoria || null,
      toNumber(montoNormalizado),
      descripcion || null,
    ]
  );

  return result.rows[0];
};

export const cerrarCaja = async ({
  id_caja_sesion,
  id_usuario,
  monto_cierre_reportado,
  observaciones_cierre,
}) => {
  const sesion = await getCajaSesionById(id_caja_sesion);
  if (!sesion || sesion.estado !== "ABIERTA") {
    throw new Error("La caja indicada no esta abierta");
  }

  const montoReportado = Number(monto_cierre_reportado);
  if (!Number.isFinite(montoReportado) || montoReportado < 0) {
    throw new Error("monto_cierre_reportado debe ser un numero mayor o igual a 0");
  }

  const { resumen } = await getCajaResumen(id_caja_sesion);
  const diferencia = toNumber(montoReportado - resumen.cierre_calculado);

  const result = await pool.query(
    `
      UPDATE "Caja_sesion"
      SET
        estado = 'CERRADA',
        fecha_cierre = now(),
        monto_cierre_reportado = $1,
        monto_cierre_calculado = $2,
        diferencia = $3,
        observaciones_cierre = $4,
        updated_by = $5
      WHERE id_caja_sesion = $6
      RETURNING *
    `,
    [
      toNumber(montoReportado),
      resumen.cierre_calculado,
      diferencia,
      observaciones_cierre || null,
      Number(id_usuario),
      Number(id_caja_sesion),
    ]
  );

  return result.rows[0];
};
