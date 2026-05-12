import * as Empleado from "../models/empleado.model.js";
import {
  buildEmpleadoPersistencePayload,
  normalizeEmpleadoPayload,
  validateEmpleadoPayload,
} from "../validators/empleado.validator.js";
import { asyncHandler, httpError } from "../utils/asyncHandler.js";

// Refactor a asyncHandler: errores no manejados van al handler global.

const parseEmpleadoId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw httpError(400, "id_empleado invalido");
  }
  return parsed;
};

export const listarEmpleados = asyncHandler(async (req, res) => {
  const empleados = await Empleado.getEmpleados({
    incluirInactivos:
      String(req.query?.incluirInactivos || "").toLowerCase() === "true",
  });
  res.json({ ok: true, data: empleados });
});

export const crearEmpleado = asyncHandler(async (req, res) => {
  const payload = normalizeEmpleadoPayload(req.body);
  const validationError = validateEmpleadoPayload(payload);
  if (validationError) throw httpError(400, validationError);

  const empleado = await Empleado.createEmpleado({
    ...buildEmpleadoPersistencePayload(payload),
    actorId: req.user?.id_usuario ?? null,
  });
  res.status(201).json({ ok: true, empleado });
});

export const actualizarEmpleado = asyncHandler(async (req, res) => {
  const id_empleado = parseEmpleadoId(req.params.id);

  const payload = normalizeEmpleadoPayload(req.body);
  const validationError = validateEmpleadoPayload(payload);
  if (validationError) throw httpError(400, validationError);

  const empleado = await Empleado.updateEmpleado(
    id_empleado,
    buildEmpleadoPersistencePayload(payload),
    req.user?.id_usuario ?? null
  );
  if (!empleado) throw httpError(404, "Empleado no encontrado");

  res.json({ ok: true, empleado });
});

export const desactivarEmpleado = asyncHandler(async (req, res) => {
  const id_empleado = parseEmpleadoId(req.params.id);

  const empleado = await Empleado.desactivarEmpleado(
    id_empleado,
    req.user?.id_usuario ?? null
  );
  if (!empleado) throw httpError(404, "Empleado no encontrado o ya inactivo");

  res.json({ ok: true, empleado });
});

export const activarEmpleado = asyncHandler(async (req, res) => {
  const id_empleado = parseEmpleadoId(req.params.id);

  const empleado = await Empleado.activarEmpleado(
    id_empleado,
    req.user?.id_usuario ?? null
  );
  if (!empleado) throw httpError(404, "Empleado no encontrado o ya activo");

  res.json({ ok: true, empleado });
});
