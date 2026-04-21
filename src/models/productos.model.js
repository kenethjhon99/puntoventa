import { pool } from "../config/db.js";

const calculateEan13CheckDigit = (baseValue) => {
  const digits = String(baseValue || "").replace(/\D/g, "");

  if (digits.length !== 12) {
    throw new Error("El codigo base debe tener 12 digitos");
  }

  const total = digits.split("").reduce((acc, digit, index) => {
    const factor = index % 2 === 0 ? 1 : 3;
    return acc + Number(digit) * factor;
  }, 0);

  return (10 - (total % 10)) % 10;
};

const buildInternalEan13Candidate = () => {
  const seed = `${Date.now()}${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0")}`.replace(/\D/g, "");
  const base12 = `20${seed.slice(-10).padStart(10, "0")}`;
  return `${base12}${calculateEan13CheckDigit(base12)}`;
};

/**
 * Normaliza un scope recibido por query string al conjunto de catalogos
 * que deben mostrarse. Soporta los nuevos nombres y los legacy.
 *
 * Nuevos:
 *   TIENDA            -> catalogo IN ('TIENDA','PRODUCTOS_TALLER','GENERAL')
 *   PRODUCTOS_TALLER  -> catalogo = 'PRODUCTOS_TALLER'
 *   ALL               -> sin filtro
 *
 * Legacy (alias):
 *   GENERAL           -> TIENDA (lo que antes era catalogo de tienda/pos)
 *   SERVICIOS         -> PRODUCTOS_TALLER
 *
 * Durante la transicion, TIENDA tambien incluye productos con
 * catalogo='GENERAL' (sin clasificar) para no "esconder" productos
 * viejos que aun no tienen catalogo asignado. Se endurece en Fase 4.
 */
const resolveCatalogosVisibles = (scope) => {
  const s = String(scope || "GENERAL").trim().toUpperCase();

  if (s === "ALL") return null; // null = sin filtro
  if (s === "PRODUCTOS_TALLER" || s === "SERVICIOS") {
    return ["PRODUCTOS_TALLER"];
  }
  // TIENDA o GENERAL (legacy) o cualquier otro -> catalogo de tienda
  return ["TIENDA", "PRODUCTOS_TALLER", "GENERAL"];
};

export const getProductos = async ({ scope = "TIENDA" } = {}) => {
  const catalogos = resolveCatalogosVisibles(scope);
  const params = [];
  let scopeWhere = "";

  if (catalogos) {
    scopeWhere = `AND COALESCE(p.catalogo, 'GENERAL') = ANY($1::text[])`;
    params.push(catalogos);
  }

  const result = await pool.query(
    `
    SELECT
      p.*,
      COALESCE(s.existencia, 0) AS stock,
      s.stock_minimo,
      s.ubicacion,
      s.id_bodega
    FROM "Producto" p
    LEFT JOIN "Stock_producto" s
      ON s.id_producto = p.id_producto
     AND s.id_bodega = 1
    WHERE COALESCE(p.activo, true) = true
      ${scopeWhere}
    ORDER BY p.nombre ASC
  `,
    params
  );

  return result.rows;
};

export const getProductoById = async (id_producto) => {
  const result = await pool.query(`
    SELECT
      p.*,
      COALESCE(s.existencia, 0) AS stock,
      s.stock_minimo,
      s.ubicacion,
      s.id_bodega
    FROM "Producto" p
    LEFT JOIN "Stock_producto" s
      ON s.id_producto = p.id_producto
     AND s.id_bodega = 1
    WHERE p.id_producto = $1
    LIMIT 1
  `, [id_producto]);

  return result.rows[0];
};

export const createProductoConStock = async ({
  codigo_barras,
  nombre,
  descripcion,
  precio_compra,
  precio_venta,
  catalogo = "GENERAL",
  existencia_inicial = 0,
  stock_minimo = 0,
  ubicacion = null,
  id_bodega = 1,
  id_usuario = null,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const catalogoNormalizado = String(catalogo || "GENERAL").trim().toUpperCase();

    // 1) Insert Producto
    const prod = await client.query(
      `INSERT INTO "Producto"
         (codigo_barras, nombre, descripcion, precio_compra, precio_venta,
          catalogo, activo, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7,$7)
       RETURNING "id_producto"`,
      [
        codigo_barras,
        nombre,
        descripcion,
        precio_compra,
        precio_venta,
        catalogoNormalizado,
        id_usuario,
      ]
    );

    const id_producto = prod.rows[0].id_producto;

    // 2) Insert Stock_producto (para bodega 1)
    await client.query(
      'INSERT INTO "Stock_producto" ("existencia","stock_minimo","ubicacion","id_producto","id_bodega","created_by","updated_by") VALUES ($1,$2,$3,$4,$5,$6,$6)',
      [existencia_inicial, stock_minimo, ubicacion, id_producto, id_bodega, id_usuario]
    );

    await client.query("COMMIT");

    // devolver el producto + stock (opcional)
    const full = await client.query(
      `SELECT p.*, s."existencia", s."stock_minimo", s."ubicacion", s."id_bodega"
       FROM "Producto" p
       JOIN "Stock_producto" s ON s."id_producto" = p."id_producto"
       WHERE p."id_producto" = $1`,
      [id_producto]
    );

    return full.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateProducto = async (id, data, actorId = null) => {
  const fields = [];
  const values = [];
  let index = 1;

  const nextData = { ...data, updated_by: actorId };

  for (const key in nextData) {
    fields.push(`${key} = $${index}`);
    values.push(nextData[key]);
    index++;
  }

  if (fields.length === 0) {
    return null;
  }

  const query = `
    UPDATE "Producto"
    SET ${fields.join(", ")}
    WHERE id_producto = $${index}
    RETURNING *
  `;

  values.push(id);

  const result = await pool.query(query, values);
  return result.rows[0];
};

export const existsCodigoBarras = async (codigo_barras, excludeId = null) => {
  if (excludeId) {
    const r = await pool.query(
      'SELECT 1 FROM "Producto" WHERE codigo_barras = $1 AND id_producto <> $2 LIMIT 1',
      [codigo_barras, excludeId]
    );
    return r.rowCount > 0;
  }

  const r = await pool.query(
    'SELECT 1 FROM "Producto" WHERE codigo_barras = $1 LIMIT 1',
    [codigo_barras]
  );
  return r.rowCount > 0;
};

export const generateUniqueCodigoBarras = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const codigo = buildInternalEan13Candidate();
    const exists = await existsCodigoBarras(codigo);

    if (!exists) {
      return codigo;
    }
  }

  throw new Error("No se pudo generar un codigo de barras unico");
};

export const deleteProducto = async (id, actorId = null) => {
  const result = await pool.query(
    `UPDATE "Producto"
     SET activo = false,
         inactivado_en = now(),
         inactivado_por = $2,
         updated_by = $2
     WHERE id_producto = $1
       AND COALESCE(activo, true) = true
     RETURNING *`,
    [id, actorId]
  );
  return result.rows[0];
};
