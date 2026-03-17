import { pool } from "../config/db.js";

export const getStock = async () => {
  const result = await pool.query(`
    SELECT 
      p.id_producto,
      p.codigo_barras,
      p.nombre,
      p.precio_venta,
      s.id_stock,
      s.existencia,
      s.stock_minimo,
      s.ubicacion,
      s.id_bodega
    FROM "Producto" p
    JOIN "Stock_producto" s 
      ON s."id_producto" = p."id_producto"
    ORDER BY p."nombre" ASC
  `);

  return result.rows;
};

export const getStockByProducto = async (id_producto, id_bodega = 1) => {
  const r = await pool.query(
    `SELECT * FROM "Stock_producto" 
     WHERE id_producto = $1 AND id_bodega = $2`,
    [id_producto, id_bodega]
  );
  return r.rows[0];
};

export const setExistencia = async (id_producto, existencia, id_bodega = 1) => {
  const r = await pool.query(
    `UPDATE "Stock_producto"
     SET existencia = $1
     WHERE id_producto = $2 AND id_bodega = $3
     RETURNING *`,
    [existencia, id_producto, id_bodega]
  );
  return r.rows[0];
};

export const crearMovimientoStock = async ({
  id_producto,
  id_bodega = 1,
  tipo,
  motivo = null,
  cantidad,
  nueva_existencia = null,
  id_usuario = null,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Traer stock actual
    const rStock = await client.query(
      `SELECT existencia
       FROM "Stock_producto"
       WHERE id_producto = $1 AND id_bodega = $2
       FOR UPDATE`,
      [id_producto, id_bodega]
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
      [existencia_despues, id_producto, id_bodega]
    );

    // 4) Insertar movimiento
    const rMov = await client.query(
      `INSERT INTO "Movimiento_stock"
       (tipo, motivo, cantidad, existencia_antes, existencia_despues, id_producto, id_bodega, id_usuario)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [tipo, motivo, cantidad, existencia_antes, existencia_despues, id_producto, id_bodega, id_usuario]
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

export const getMovimientosStock = async ({ id_producto = null, id_bodega = 1, limit = 50 } = {}) => {
  const values = [];
  let where = `WHERE ms.id_bodega = $1`;
  values.push(id_bodega);

  if (id_producto) {
    where += ` AND ms.id_producto = $2`;
    values.push(id_producto);
  }

  const r = await pool.query(
    `
    SELECT ms.*
    FROM "Movimiento_stock" ms
    ${where}
    ORDER BY ms.fecha DESC
    LIMIT ${Number(limit) || 50}
    `,
    values
  );

  return r.rows;
};

export const updateDatosStock = async ({
  id_producto,
  id_bodega = 1,
  stock_minimo,
  ubicacion,
}) => {
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
  values.push(id_bodega);

  const query = `
    UPDATE "Stock_producto"
    SET ${fields.join(", ")}
    WHERE id_producto = $${index} AND id_bodega = $${index + 1}
    RETURNING *
  `;

  const r = await pool.query(query, values);
  return r.rows[0];
};