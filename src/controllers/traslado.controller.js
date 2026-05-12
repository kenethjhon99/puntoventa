import * as Traslado from "../models/traslado.model.js";
import {
  normalizeListQuery,
  normalizeTrasladoPayload,
  validateTrasladoPayload,
} from "../validators/traslado.validator.js";
import { asyncHandler, httpError } from "../utils/asyncHandler.js";

// Refactor a asyncHandler: errores no manejados van al handler global.
// Errores de negocio se lanzan con httpError(status, msg).

const parseId = (raw, label = "id") => {
  if (!/^\d+$/.test(String(raw))) {
    throw httpError(400, `${label} invalido`);
  }
  return Number(raw);
};

export const listarTraslados = asyncHandler(async (req, res) => {
  const query = normalizeListQuery(req.query);
  const result = await Traslado.listarTraslados(query);
  res.json({ ok: true, ...result });
});

export const getTraslado = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const data = await Traslado.getTrasladoCompleto(id);
  if (!data) throw httpError(404, "Traslado no encontrado");
  res.json({ ok: true, ...data });
});

export const listarBodegasTraslado = asyncHandler(async (_req, res) => {
  const data = await Traslado.listarBodegasTraslado();
  res.json({ ok: true, data });
});

export const listarProductosBodegaOrigen = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, "id de bodega");
  const data = await Traslado.listarProductosBodegaOrigen(id, {
    q: req.query.q,
  });
  res.json({ ok: true, data });
});

export const crearTraslado = asyncHandler(async (req, res) => {
  const payload = normalizeTrasladoPayload(req.body);
  const validationError = validateTrasladoPayload(payload);
  if (validationError) throw httpError(400, validationError);

  const data = await Traslado.crearTraslado({
    ...payload,
    id_usuario: req.user.id_usuario,
  });
  res.status(201).json({ ok: true, ...data });
});
