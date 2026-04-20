import { pool } from "../config/db.js";
import { calcularFechaCobro, toIsoDate } from "../utils/calcularFechaCobro.js";

const SELECT_CREDITO = `
  SELECT
    ce.id_credito_empleado,
    ce.id_venta,
    ce.id_empleado,
    ce.monto,
    ce.saldo_pendiente,
    ce.fecha_credito,
    ce.fecha_cobro_estimada,
    ce.estado,
    ce.observacion,
    ce.motivo_condonacion,
    ce.cobrado_en,
    ce.cobrado_por,
    ce.created_at,
    ce.updated_at,
    ce.created_by,
    ce.updated_by,
    e.nombre     AS empleado_nombre,
    e.cargo      AS empleado_cargo,
    e.tipo_pago  AS empleado_tipo_pago,
    e.dia_pago   AS empleado_dia_pago,
    e.sueldo     AS empleado_sueldo,
    e.activo     AS empleado_activo,
    v.fecha      AS venta_fecha,
    v.total      AS venta_total,
    v.numero_comprobante AS venta_numero_comprobante,
    u_cob.nombre   AS cobrado_por_nombre,
    u_cob.username AS cobrado_por_username,
    (ce.fecha_cobro_estimada - CURRENT_DATE) AS dias_para_cobro,
    CASE
      WHEN ce.estado != 'PENDIENTE' THEN 'VIGENTE'
      WHEN ce.fecha_cobro_estimada < CURRENT_DATE THEN 'VENCIDO'
      WHEN ce.fecha_cobro_estimada <= CURRENT_DATE + INTERVAL '3 days' THEN 'POR_VENCER'
      ELSE 'VIGENTE'
    END AS criticidad
  FROM "Credito_empleado" ce
  JOIN "Empleado" e ON e.id_empleado = ce.id_empleado
  JOIN "Venta" v    ON v.id_venta    = ce.id_venta
  LEFT JOIN "Usuario" u_cob ON u_cob.id_usuario = ce.cobrado_por
`;

/**
 * Inserta un credito a empleado dentro de una transaccion existente.
 * Llamado desde crearVenta cuando la venta es a credito.
 *
 * @param {object} client pg client con BEGIN ya iniciado
 * @param {{ id_venta, id_empleado, monto, observacion, id_usuario }} data
 * @returns {Promise<object>} credito recien creado
 */
export const insertCreditoEnTx = async (client, data) => {
  const {
    id_venta,
    id_empleado,
    monto,
    observacion = null,
    id_usuario = null,
  } = data;

  const rEmp = await client.query(
    `SELECT id_empleado, nombre, cargo, tipo_pago, dia_pago, sueldo, activo
       FROM "Empleado"
      WHERE id_empleado = $1
      FOR UPDATE`,
    [id_empleado]
  );

  if (rEmp.rowCount === 0) {
    throw new Error("Empleado no encontrado");
  }

  const empleado = rEmp.rows[0];

  if (!empleado.activo) {
    throw new Error("No se puede otorgar credito a un empleado inactivo");
  }

  if (!["SEMANAL", "MENSUAL"].includes(String(empleado.tipo_pago || "").toUpperCase())) {
    throw new Error("El tipo_pago del empleado no soporta credito");
  }

  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) {
    throw new Error("Monto de credito invalido");
  }

  const fechaCobro = toIsoDate(calcularFechaCobro(empleado));

  const result = await client.query(
    `
      INSERT INTO "Credito_empleado" (
        id_venta,
        id_empleado,
        monto,
        saldo_pendiente,
        fecha_cobro_estimada,
        observacion,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $3, $4, $5, $6, $6)
      RETURNING *
    `,
    [id_venta, id_empleado, montoNum.toFixed(2), fechaCobro, observacion, id_usuario]
  );

  return { credito: result.rows[0], empleado };
};

export const listarCreditos = async (filters = {}) => {
  const where = [];
  const params = [];
  let idx = 1;

  if (filters.estado) {
    where.push(`ce.estado = $${idx++}`);
    params.push(filters.estado);
  }

  if (filters.id_empleado) {
    where.push(`ce.id_empleado = $${idx++}`);
    params.push(filters.id_empleado);
  }

  if (filters.desde) {
    where.push(`ce.fecha_credito >= $${idx++}::date`);
    params.push(filters.desde);
  }

  if (filters.hasta) {
    where.push(`ce.fecha_credito <= ($${idx++}::date + INTERVAL '1 day')`);
    params.push(filters.hasta);
  }

  if (filters.criticidad) {
    if (filters.criticidad === "VENCIDO") {
      where.push(`ce.estado = 'PENDIENTE' AND ce.fecha_cobro_estimada < CURRENT_DATE`);
    } else if (filters.criticidad === "POR_VENCER") {
      where.push(
        `ce.estado = 'PENDIENTE'
         AND ce.fecha_cobro_estimada >= CURRENT_DATE
         AND ce.fecha_cobro_estimada <= CURRENT_DATE + INTERVAL '3 days'`
      );
    } else if (filters.criticidad === "VIGENTE") {
      where.push(
        `(ce.estado != 'PENDIENTE' OR ce.fecha_cobro_estimada > CURRENT_DATE + INTERVAL '3 days')`
      );
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 25));
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM "Credito_empleado" ce
       JOIN "Empleado" e ON e.id_empleado = ce.id_empleado
     ${whereSql}`,
    params
  );

  const dataResult = await pool.query(
    `
      ${SELECT_CREDITO}
      ${whereSql}
      ORDER BY ce.fecha_cobro_estimada ASC, ce.id_credito_empleado DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    params
  );

  return {
    data: dataResult.rows,
    page,
    limit,
    total: countResult.rows[0].total,
  };
};

export const getCreditoById = async (id_credito_empleado) => {
  const r = await pool.query(
    `${SELECT_CREDITO} WHERE ce.id_credito_empleado = $1`,
    [id_credito_empleado]
  );
  return r.rows[0] || null;
};

export const getAlertasAdmin = async () => {
  const r = await pool.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE ce.estado = 'PENDIENTE'
          AND ce.fecha_cobro_estimada < CURRENT_DATE
      )::int AS vencidos,
      COUNT(*) FILTER (
        WHERE ce.estado = 'PENDIENTE'
          AND ce.fecha_cobro_estimada >= CURRENT_DATE
          AND ce.fecha_cobro_estimada <= CURRENT_DATE + INTERVAL '3 days'
      )::int AS por_vencer,
      COUNT(*) FILTER (
        WHERE ce.estado = 'PENDIENTE'
          AND ce.fecha_cobro_estimada > CURRENT_DATE + INTERVAL '3 days'
      )::int AS vigentes,
      COALESCE(SUM(ce.saldo_pendiente) FILTER (
        WHERE ce.estado = 'PENDIENTE'
      ), 0)::numeric(18,2) AS saldo_total_pendiente
    FROM "Credito_empleado" ce
  `);

  const top = await pool.query(`
    ${SELECT_CREDITO}
    WHERE ce.estado = 'PENDIENTE'
    ORDER BY ce.fecha_cobro_estimada ASC
    LIMIT 5
  `);

  return {
    resumen: r.rows[0],
    top: top.rows,
  };
};

export const getNominaProxima = async () => {
  const r = await pool.query(`
    SELECT
      e.id_empleado,
      e.nombre,
      e.cargo,
      e.tipo_pago,
      e.dia_pago,
      e.sueldo,
      e.activo,
      COALESCE(SUM(ce.saldo_pendiente) FILTER (
        WHERE ce.estado = 'PENDIENTE'
      ), 0)::numeric(18,2) AS total_creditos_pendientes,
      COUNT(ce.id_credito_empleado) FILTER (
        WHERE ce.estado = 'PENDIENTE'
      )::int AS num_creditos_pendientes,
      (e.sueldo - COALESCE(SUM(ce.saldo_pendiente) FILTER (
        WHERE ce.estado = 'PENDIENTE'
      ), 0))::numeric(18,2) AS sueldo_neto_estimado
    FROM "Empleado" e
    LEFT JOIN "Credito_empleado" ce ON ce.id_empleado = e.id_empleado
    WHERE e.activo = true
    GROUP BY e.id_empleado
    ORDER BY e.nombre ASC
  `);

  // adjuntar fecha de cobro calculada en JS
  return r.rows.map((row) => {
    let fecha_pago_estimada = null;
    try {
      fecha_pago_estimada = toIsoDate(calcularFechaCobro(row));
    } catch {
      fecha_pago_estimada = null;
    }
    return {
      ...row,
      fecha_pago_estimada,
      saldo_rojo: Number(row.sueldo_neto_estimado) < 0,
    };
  });
};

export const cobrarCredito = async ({ id_credito_empleado, nota, id_usuario }) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rCur = await client.query(
      `SELECT id_credito_empleado, estado, saldo_pendiente
         FROM "Credito_empleado"
        WHERE id_credito_empleado = $1
        FOR UPDATE`,
      [id_credito_empleado]
    );

    if (rCur.rowCount === 0) {
      throw new Error("Credito no encontrado");
    }

    if (rCur.rows[0].estado !== "PENDIENTE") {
      throw new Error("Solo se pueden cobrar creditos en estado PENDIENTE");
    }

    const r = await client.query(
      `
        UPDATE "Credito_empleado"
           SET estado = 'COBRADO',
               saldo_pendiente = 0,
               cobrado_en = now(),
               cobrado_por = $2,
               observacion = COALESCE($3, observacion),
               updated_by = $2,
               updated_at = now()
         WHERE id_credito_empleado = $1
         RETURNING *
      `,
      [id_credito_empleado, id_usuario, nota]
    );

    await client.query("COMMIT");
    return r.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

export const condonarCredito = async ({ id_credito_empleado, motivo, id_usuario }) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rCur = await client.query(
      `SELECT id_credito_empleado, estado
         FROM "Credito_empleado"
        WHERE id_credito_empleado = $1
        FOR UPDATE`,
      [id_credito_empleado]
    );

    if (rCur.rowCount === 0) {
      throw new Error("Credito no encontrado");
    }

    if (rCur.rows[0].estado !== "PENDIENTE") {
      throw new Error("Solo se pueden condonar creditos en estado PENDIENTE");
    }

    const r = await client.query(
      `
        UPDATE "Credito_empleado"
           SET estado = 'CONDONADO',
               saldo_pendiente = 0,
               motivo_condonacion = $2,
               updated_by = $3,
               updated_at = now()
         WHERE id_credito_empleado = $1
         RETURNING *
      `,
      [id_credito_empleado, motivo, id_usuario]
    );

    await client.query("COMMIT");
    return r.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

/**
 * Helper para que la anulacion de venta marque el credito asociado.
 * Idempotente: si no hay credito o ya esta ANULADO, no hace nada.
 */
export const marcarCreditoAnuladoEnTx = async (client, id_venta) => {
  await client.query(
    `
      UPDATE "Credito_empleado"
         SET estado = 'ANULADO',
             saldo_pendiente = 0,
             updated_at = now()
       WHERE id_venta = $1
         AND estado = 'PENDIENTE'
    `,
    [id_venta]
  );
};
