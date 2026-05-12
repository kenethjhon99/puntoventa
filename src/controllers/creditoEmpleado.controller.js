import * as CreditoEmpleado from "../models/creditoEmpleado.model.js";
import {
  normalizeListQuery,
  validateListQuery,
  normalizeCobrarPayload,
  normalizeCondonarPayload,
  validateCondonarPayload,
} from "../validators/creditoEmpleado.validator.js";
import { asyncHandler, httpError } from "../utils/asyncHandler.js";

// Refactor a asyncHandler: errores no manejados van al handler global.

const parsePositiveInt = (value, label) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw httpError(400, `${label} invalido`);
  }
  return n;
};

export const listarCreditos = asyncHandler(async (req, res) => {
  const query = normalizeListQuery(req.query);
  const validationError = validateListQuery(query);
  if (validationError) throw httpError(400, validationError);

  const result = await CreditoEmpleado.listarCreditos(query);
  res.json({ ok: true, ...result });
});

export const getCredito = asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id, "id_credito_empleado");

  const credito = await CreditoEmpleado.getCreditoById(id);
  if (!credito) throw httpError(404, "Credito no encontrado");

  res.json({ ok: true, credito });
});

export const getAlertas = asyncHandler(async (_req, res) => {
  const data = await CreditoEmpleado.getAlertasAdmin();
  res.json({ ok: true, ...data });
});

export const getNominaProxima = asyncHandler(async (_req, res) => {
  const data = await CreditoEmpleado.getNominaProxima();
  res.json({ ok: true, data });
});

export const cobrarCredito = asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id, "id_credito_empleado");
  const payload = normalizeCobrarPayload(req.body);

  const credito = await CreditoEmpleado.cobrarCredito({
    id_credito_empleado: id,
    nota: payload.nota,
    id_usuario: req.user?.id_usuario ?? null,
  });

  res.json({ ok: true, credito });
});

export const condonarCredito = asyncHandler(async (req, res) => {
  const id = parsePositiveInt(req.params.id, "id_credito_empleado");

  const payload = normalizeCondonarPayload(req.body);
  const validationError = validateCondonarPayload(payload);
  if (validationError) throw httpError(400, validationError);

  const credito = await CreditoEmpleado.condonarCredito({
    id_credito_empleado: id,
    motivo: payload.motivo,
    id_usuario: req.user?.id_usuario ?? null,
  });

  res.json({ ok: true, credito });
});
