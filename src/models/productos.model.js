import { pool } from "../config/db.js";
import {
  CATALOGO_GENERAL,
  CATALOGO_PRODUCTOS_TALLER,
  getBodegaKeyForCatalogo,
  getBodegaKeyForScope,
  normalizeCatalogoKey,
} from "../constants/inventory.js";
import { requireBodegaLogicaByKey } from "./bodega.model.js";

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

const getScopedWarehouse = async (scope, executor = null) => {
  const bodegaKey = getBodegaKeyForScope(scope);
  if (!bodegaKey) return null;
  return requireBodegaLogicaByKey(bodegaKey, executor);
};

const mapProductoRow = (row, scopedBodegaId = null) => {
  const stockGeneral = Number(row.stock_general || 0);
  const stockTiendaTaller = Number(row.stock_tienda_taller || 0);
  const stockTotal = Number(row.stock_total || 0);

  let stockVisible = stockTotal;
  if (scopedBodegaId && Number(scopedBodegaId) === Number(row.id_bodega_general)) {
    stockVisible = stockGeneral;
  } else if (
    scopedBodegaId &&
    Number(scopedBodegaId) === Number(row.id_bodega_tienda_taller)
  ) {
    stockVisible = stockTiendaTaller;
  }

  return {
    ...row,
    stock_general: stockGeneral,
    stock_tienda_taller: stockTiendaTaller,
    stock_total: stockTotal,
    stock: stockVisible,
    stock_minimo:
      row.stock_minimo_scope != null
        ? Number(row.stock_minimo_scope)
        : row.stock_minimo_general != null
          ? Number(row.stock_minimo_general)
          : row.stock_minimo_tienda_taller != null
            ? Number(row.stock_minimo_tienda_taller)
            : 0,
    ubicacion:
      row.ubicacion_scope ??
      row.ubicacion_general ??
      row.ubicacion_tienda_taller ??
      null,
    id_bodega: scopedBodegaId ?? null,
    id_bodega_general: row.id_bodega_general ?? null,
    id_bodega_tienda_taller: row.id_bodega_tienda_taller ?? null,
  };
};

const buildProductoSelect = (scopeWhere = "", stockScopeJoin = "") => `
  SELECT
    p.*,
    bg.id_bodega AS id_bodega_general,
    bt.id_bodega AS id_bodega_tienda_taller,
    COALESCE(sg.existencia, 0) AS stock_general,
    COALESCE(st.existencia, 0) AS stock_tienda_taller,
    COALESCE(sg.existencia, 0) + COALESCE(st.existencia, 0) AS stock_total,
    sg.stock_minimo AS stock_minimo_general,
    st.stock_minimo AS stock_minimo_tienda_taller,
    sg.ubicacion AS ubicacion_general,
    st.ubicacion AS ubicacion_tienda_taller,
    ss.stock_minimo AS stock_minimo_scope,
    ss.ubicacion AS ubicacion_scope
  FROM "Producto" p
  CROSS JOIN (
    SELECT id_bodega FROM "Bodega"
    WHERE UPPER(TRIM("Nombre")) = 'GENERAL'
    ORDER BY id_bodega ASC
    LIMIT 1
  ) bg
  CROSS JOIN (
    SELECT id_bodega FROM "Bodega"
    WHERE UPPER(TRIM("Nombre")) = 'TIENDA_TALLER'
    ORDER BY id_bodega ASC
    LIMIT 1
  ) bt
  LEFT JOIN "Stock_producto" sg
    ON sg.id_producto = p.id_producto
   AND sg.id_bodega = bg.id_bodega
  LEFT JOIN "Stock_producto" st
    ON st.id_producto = p.id_producto
   AND st.id_bodega = bt.id_bodega
  ${stockScopeJoin}
  WHERE COALESCE(p.activo, true) = true
    ${scopeWhere}
`;

const buildScopeVisibilityWhere = (scope = "ALL") => {
  const normalizedScope = normalizeCatalogoKey(scope, "ALL");

  switch (normalizedScope) {
    case "GENERAL":
    case "VENTAS":
      return `
        AND COALESCE(p.catalogo, '${CATALOGO_GENERAL}') = '${CATALOGO_GENERAL}'
        AND COALESCE(sg.existencia, 0) > 0
      `;

    case "TIENDA":
      return `
        AND COALESCE(st.existencia, 0) > 0
      `;

    case "PRODUCTOS_TALLER":
    case "SERVICIOS":
    case "REPARACION":
      return `
        AND COALESCE(p.catalogo, '${CATALOGO_GENERAL}') = '${CATALOGO_PRODUCTOS_TALLER}'
        AND COALESCE(st.existencia, 0) > 0
      `;

    default:
      return "";
  }
};

export const getProductos = async ({ scope = "ALL" } = {}) => {
  const scopedWarehouse = await getScopedWarehouse(scope);
  const scopeWhere = buildScopeVisibilityWhere(scope);

  const stockScopeJoin = scopedWarehouse
    ? `
      LEFT JOIN "Stock_producto" ss
        ON ss.id_producto = p.id_producto
       AND ss.id_bodega = ${Number(scopedWarehouse.id_bodega)}
    `
    : `LEFT JOIN "Stock_producto" ss ON 1 = 0`;

  // Safety cap: limite alto pero finito para prevenir DoS si la tabla
  // crece sin control. El frontend recibe un array como siempre. Si en
  // algun momento el catalogo se acerca a este techo, se debera
  // implementar paginacion real (?page, ?limit) y migrar el frontend.
  const result = await pool.query(
    `
      ${buildProductoSelect(scopeWhere, stockScopeJoin)}
      ORDER BY p.nombre ASC
      LIMIT 10000
    `
  );

  return result.rows.map((row) =>
    mapProductoRow(row, scopedWarehouse?.id_bodega ?? null)
  );
};

export const getProductoById = async (id_producto, { scope = "ALL" } = {}) => {
  const scopedWarehouse = await getScopedWarehouse(scope);
  const scopeWhere = buildScopeVisibilityWhere(scope);
  const stockScopeJoin = scopedWarehouse
    ? `
      LEFT JOIN "Stock_producto" ss
        ON ss.id_producto = p.id_producto
       AND ss.id_bodega = ${Number(scopedWarehouse.id_bodega)}
    `
    : `LEFT JOIN "Stock_producto" ss ON 1 = 0`;

  const result = await pool.query(
    `
      ${buildProductoSelect(`AND p.id_producto = $1 ${scopeWhere}`, stockScopeJoin)}
      LIMIT 1
    `,
    [id_producto]
  );

  if (!result.rows[0]) return null;
  return mapProductoRow(result.rows[0], scopedWarehouse?.id_bodega ?? null);
};

export const createProductoConStock = async ({
  codigo_barras,
  nombre,
  descripcion,
  precio_compra,
  precio_venta,
  catalogo = CATALOGO_GENERAL,
  existencia_inicial = 0,
  stock_minimo = 0,
  ubicacion = null,
  id_usuario = null,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const catalogoNormalizado = String(catalogo || CATALOGO_GENERAL)
      .trim()
      .toUpperCase();
    const bodega = await requireBodegaLogicaByKey(
      getBodegaKeyForCatalogo(catalogoNormalizado),
      client
    );

    const prod = await client.query(
      `INSERT INTO "Producto"
         (codigo_barras, nombre, descripcion, precio_compra, precio_venta,
          catalogo, activo, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7,$7)
       RETURNING id_producto`,
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

    await client.query(
      `
        INSERT INTO "Stock_producto"
          (existencia, stock_minimo, ubicacion, id_producto, id_bodega, created_by, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $6)
      `,
      [
        existencia_inicial,
        stock_minimo,
        ubicacion,
        id_producto,
        bodega.id_bodega,
        id_usuario,
      ]
    );

    await client.query("COMMIT");
    return getProductoById(id_producto);
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
    `
      UPDATE "Producto"
      SET activo = false,
          inactivado_en = now(),
          inactivado_por = $2,
          updated_by = $2
      WHERE id_producto = $1
        AND COALESCE(activo, true) = true
      RETURNING *
    `,
    [id, actorId]
  );
  return result.rows[0];
};
