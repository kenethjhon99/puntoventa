import * as Producto from "../models/productos.model.js";
import * as Stock from "../models/stock.model.js";
import { validateProductoUpdate } from "../validators/producto.validator.js";

const getNormalizedRoles = (req) =>
  (Array.isArray(req.user?.roles) ? req.user.roles : [])
    .map((role) => String(role).trim().toUpperCase())
    .filter(Boolean);

const isAdminProductManager = (req) =>
  getNormalizedRoles(req).some((role) => ["SUPER_ADMIN", "ADMIN"].includes(role));

const isServiciosProductManager = (req) =>
  getNormalizedRoles(req).includes("ENCARGADO_SERVICIOS");

/**
 * Permiso de lectura por scope.
 *   scope = TIENDA | PRODUCTOS_TALLER | ALL
 *   - TIENDA            -> cualquier rol con acceso a ventas/caja/lectura.
 *   - PRODUCTOS_TALLER  -> admin, cajero, mecanico, encargado_servicios.
 *   - ALL               -> solo admin.
 *
 * Se mantienen los alias GENERAL/SERVICIOS para compatibilidad transitoria:
 *   GENERAL -> TIENDA, SERVICIOS -> PRODUCTOS_TALLER.
 */
const normalizeScopeAlias = (scope) => {
  const s = String(scope || "").trim().toUpperCase();
  if (s === "SERVICIOS") return "PRODUCTOS_TALLER";
  if (!s || s === "GENERAL") return "TIENDA";
  return s;
};

const canAccessScope = (req, scope) => {
  const roles = getNormalizedRoles(req);
  const normalized = normalizeScopeAlias(scope);

  if (normalized === "PRODUCTOS_TALLER") {
    return roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO", "ENCARGADO_SERVICIOS", "LECTURA"].includes(role)
    );
  }

  if (normalized === "ALL") {
    return roles.some((role) => ["SUPER_ADMIN", "ADMIN", "LECTURA"].includes(role));
  }

  // TIENDA
  return roles.some((role) =>
    ["SUPER_ADMIN", "ADMIN", "CAJERO", "LECTURA"].includes(role)
  );
};

/**
 * Toma el body de creacion/edicion y deriva el catalogo canonico.
 * Si el body trae `catalogo`, se usa. Si trae el legacy `modulo_origen`,
 * se traduce. Retorna undefined si el body no especifica ninguno.
 */
const resolverCatalogoDesdeBody = (body = {}) => {
  const rawCatalogo = body.catalogo;
  const rawModulo = body.modulo_origen;

  if (rawCatalogo !== undefined) {
    const catalogo = String(rawCatalogo || "GENERAL").trim().toUpperCase();
    return { catalogo };
  }

  if (rawModulo !== undefined) {
    const modulo = String(rawModulo || "GENERAL").trim().toUpperCase();
    const catalogo = modulo === "SERVICIOS" ? "PRODUCTOS_TALLER" : "GENERAL";
    return { catalogo };
  }

  return undefined;
};

const esCatalogoServicios = (catalogo) =>
  String(catalogo || "").trim().toUpperCase() === "PRODUCTOS_TALLER";

export const listarProductos = async (req, res) => {
  try {
    const rawScope = String(req.query?.scope || "TIENDA").trim().toUpperCase();

    if (!canAccessScope(req, rawScope)) {
      return res.status(403).json({ error: "No autorizado para consultar este catalogo" });
    }

    const productos = await Producto.getProductos({ scope: rawScope });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const generarCodigoBarrasProducto = async (_req, res) => {
  try {
    const codigo_barras = await Producto.generateUniqueCodigoBarras();
    res.json({ codigo_barras });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const crearProducto = async (req, res) => {
  try {
    const {
      codigo_barras,
      nombre,
      descripcion,
      precio_compra,
      precio_venta,
      existencia_inicial,
      stock_minimo,
      ubicacion,
    } = req.body;

    // Resolver catalogo desde el body (acepta alias legacy modulo_origen).
    const resolved =
      resolverCatalogoDesdeBody(req.body) || { catalogo: "GENERAL" };

    // El rol de servicios solo puede crear productos de su catalogo.
    if (
      isServiciosProductManager(req) &&
      !isAdminProductManager(req) &&
      !esCatalogoServicios(resolved.catalogo)
    ) {
      return res.status(403).json({
        error: "Este rol solo puede crear productos del catalogo Productos de Taller",
      });
    }

    const creado = await Producto.createProductoConStock({
      codigo_barras,
      nombre,
      descripcion,
      precio_compra,
      precio_venta,
      catalogo: resolved.catalogo,
      existencia_inicial: Number(existencia_inicial || 0),
      stock_minimo: Number(stock_minimo || 0),
      ubicacion: ubicacion ?? null,
      id_bodega: 1,
      id_usuario: req.user?.id_usuario ?? null,
    });

    res.status(201).json(creado);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Duplicado (por ejemplo codigo_barras)" });
    }
    res.status(500).json({ error: error.message });
  }
};

export const actualizarProducto = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    const productoActual = await Producto.getProductoById(Number(id));
    if (!productoActual) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Gate: servicios solo toca los productos de su catalogo.
    const catalogoActual = String(productoActual.catalogo || "GENERAL")
      .trim()
      .toUpperCase();

    if (
      isServiciosProductManager(req) &&
      !isAdminProductManager(req) &&
      !esCatalogoServicios(catalogoActual)
    ) {
      return res.status(403).json({
        error: "Este rol solo puede editar productos del catalogo Productos de Taller",
      });
    }

    const {
      existencia_inicial,
      stock_minimo,
      ubicacion,
      ...datosProducto
    } = req.body;

    // Reconciliar catalogo del body antes de validar (tolera alias legacy).
    const resolved = resolverCatalogoDesdeBody(datosProducto);
    if (resolved) {
      datosProducto.catalogo = resolved.catalogo;
    }
    // Nunca persistimos modulo_origen aunque haya llegado en el body.
    delete datosProducto.modulo_origen;

    // El rol de servicios no puede mover un producto fuera de su catalogo.
    if (isServiciosProductManager(req) && !isAdminProductManager(req)) {
      if (
        datosProducto.catalogo !== undefined &&
        !esCatalogoServicios(datosProducto.catalogo)
      ) {
        return res.status(403).json({
          error: "Este rol solo puede mantener productos como Productos de Taller",
        });
      }

      // Forzar coherencia.
      datosProducto.catalogo = "PRODUCTOS_TALLER";
    }

    if (
      existencia_inicial !== undefined &&
      (!Number.isInteger(Number(existencia_inicial)) || Number(existencia_inicial) < 0)
    ) {
      return res.status(400).json({ error: "existencia_inicial debe ser entero >= 0" });
    }

    if (
      stock_minimo !== undefined &&
      (!Number.isInteger(Number(stock_minimo)) || Number(stock_minimo) < 0)
    ) {
      return res.status(400).json({ error: "stock_minimo debe ser entero >= 0" });
    }

    if (
      ubicacion !== undefined &&
      ubicacion !== null &&
      typeof ubicacion !== "string"
    ) {
      return res.status(400).json({ error: "ubicacion debe ser string o null" });
    }

    const v = validateProductoUpdate(datosProducto);
    if (!v.ok) {
      return res.status(400).json({ error: "Validación", details: v.errors });
    }

    if (v.data.codigo_barras) {
      const existe = await Producto.existsCodigoBarras(v.data.codigo_barras, id);
      if (existe) {
        return res.status(409).json({ error: "codigo_barras ya existe" });
      }
    }

    let actualizado = null;

    if (Object.keys(v.data).length > 0) {
      actualizado = await Producto.updateProducto(
        id,
        v.data,
        req.user?.id_usuario ?? null
      );

      if (!actualizado) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }
    }

    const stockActual = await Stock.getStockByProducto(Number(id), 1);
    if (!stockActual) {
      return res.status(404).json({ error: "No existe registro de stock para este producto" });
    }

    if (existencia_inicial !== undefined) {
      await Stock.crearMovimientoStock({
        id_producto: Number(id),
        id_bodega: 1,
        tipo: "AJUSTE",
        motivo: "Ajuste manual desde edición de producto",
        nueva_existencia: Number(existencia_inicial),
        id_usuario: req.user?.id_usuario ?? null,
      });
    }

    if (stock_minimo !== undefined || ubicacion !== undefined) {
      await Stock.updateDatosStock({
        id_producto: Number(id),
        id_bodega: 1,
        stock_minimo: stock_minimo !== undefined ? Number(stock_minimo) : undefined,
        ubicacion: ubicacion !== undefined ? ubicacion : undefined,
      });
    }

    const productoCompleto = await Producto.getProductoById(Number(id));

    res.json(productoCompleto || actualizado);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Duplicado: ya existe ese codigo_barras" });
    }
    res.status(500).json({ error: error.message });
  }
};

export const eliminarProducto = async (req, res) => {
  try {
    const { id } = req.params;
    const productoActual = await Producto.getProductoById(Number(id));

    if (!productoActual) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    const catalogoActual = String(productoActual.catalogo || "GENERAL")
      .trim()
      .toUpperCase();

    if (
      isServiciosProductManager(req) &&
      !isAdminProductManager(req) &&
      !esCatalogoServicios(catalogoActual)
    ) {
      return res.status(403).json({
        error: "Este rol solo puede desactivar productos del catalogo Productos de Taller",
      });
    }

    const eliminado = await Producto.deleteProducto(
      id,
      req.user?.id_usuario ?? null
    );
    if (!eliminado) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    res.json(eliminado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
