import * as Stock from "../models/stock.model.js";
import { asyncHandler, httpError } from "../utils/asyncHandler.js";

// Refactor a asyncHandler: errores no manejados van al handler global.

const normalizeBodegaOptions = (source = {}) => ({
  id_bodega: source.id_bodega ? Number(source.id_bodega) : null,
  bodega_key: source.bodega_key ? String(source.bodega_key).trim() : null,
});

export const listarStock = asyncHandler(async (req, res) => {
  const { q, solo_bajo_minimo } = req.query;
  const stock = await Stock.getStock({
    ...normalizeBodegaOptions(req.query),
    q: q ? String(q).trim() : "",
    solo_bajo_minimo:
      solo_bajo_minimo === "true" ||
      solo_bajo_minimo === "1" ||
      solo_bajo_minimo === true,
  });
  res.json(stock);
});

export const ajustarStock = asyncHandler(async (req, res) => {
  const { id_producto } = req.params;
  const { existencia } = req.body;

  if (!/^\d+$/.test(id_producto)) {
    throw httpError(400, "id_producto invalido");
  }

  const ex = Number(existencia);
  if (!Number.isInteger(ex) || ex < 0) {
    throw httpError(400, "existencia debe ser entero >= 0");
  }

  const bodegaOptions = normalizeBodegaOptions(req.body);
  const actual = await Stock.getStockByProducto(
    Number(id_producto),
    bodegaOptions.id_bodega,
    { bodega_key: bodegaOptions.bodega_key }
  );

  if (!actual) {
    throw httpError(
      404,
      "No existe registro de stock para este producto en la bodega indicada"
    );
  }

  const actualizado = await Stock.setExistencia(
    Number(id_producto),
    ex,
    bodegaOptions.id_bodega,
    { bodega_key: bodegaOptions.bodega_key }
  );

  res.json({
    ok: true,
    mensaje: "Stock actualizado",
    antes: actual.existencia,
    despues: actualizado.existencia,
    data: actualizado,
  });
});

export const crearMovimiento = asyncHandler(async (req, res) => {
  const { id_producto, tipo, motivo, cantidad, nueva_existencia } = req.body;

  if (!Number.isInteger(Number(id_producto))) {
    throw httpError(400, "id_producto invalido");
  }

  const bodegaOptions = normalizeBodegaOptions(req.body);

  const result = await Stock.crearMovimientoStock({
    id_producto: Number(id_producto),
    id_bodega: bodegaOptions.id_bodega,
    bodega_key: bodegaOptions.bodega_key,
    tipo,
    motivo: motivo ?? null,
    cantidad: cantidad !== undefined ? Number(cantidad) : undefined,
    nueva_existencia:
      nueva_existencia !== undefined ? Number(nueva_existencia) : null,
    id_usuario: req.user.id_usuario,
  });

  res.status(201).json({ ok: true, ...result });
});

export const listarMovimientos = asyncHandler(async (req, res) => {
  const { id_producto, limit, tipo, desde, hasta, q } = req.query;

  const data = await Stock.getMovimientosStock({
    ...normalizeBodegaOptions(req.query),
    id_producto: id_producto ? Number(id_producto) : null,
    tipo: tipo ? String(tipo).trim().toUpperCase() : null,
    desde: desde ? String(desde).trim() : null,
    hasta: hasta ? String(hasta).trim() : null,
    q: q ? String(q).trim() : "",
    limit: limit ? Number(limit) : 50,
  });

  res.json(data);
});
