import * as Proveedor from "../models/proveedor.model.js";
import {
  normalizeProveedorPayload,
  validateProveedorPayload,
} from "../validators/proveedor.validator.js";
import { asyncHandler, httpError } from "../utils/asyncHandler.js";

// Refactor a asyncHandler: el catch boilerplate desaparece. Los errores
// no manejados se delegan al handler global de app.js, que aplica la
// politica de sanitizacion (mensaje generico + requestId en prod).
//
// Errores tipados con codigo HTTP correcto se lanzan via httpError().
// El codigo 23505 (unique violation de Postgres) se maneja localmente
// porque queremos un mensaje especifico de negocio.

const parseIdProveedor = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, "id_proveedor invalido");
  }
  return id;
};

export const listarProveedores = asyncHandler(async (req, res) => {
  const proveedores = await Proveedor.getProveedores({
    incluirInactivos:
      String(req.query?.incluirInactivos || "").toLowerCase() === "true",
  });
  res.json({ ok: true, data: proveedores });
});

export const crearProveedor = asyncHandler(async (req, res) => {
  const payload = normalizeProveedorPayload(req.body);
  const validationError = validateProveedorPayload(payload);
  if (validationError) throw httpError(400, validationError);

  const nitExiste = await Proveedor.existsProveedorByNit(payload.nit);
  if (nitExiste) throw httpError(409, "Ya existe un proveedor con ese NIT");

  try {
    const proveedor = await Proveedor.createProveedor({
      ...payload,
      actorId: req.user?.id_usuario ?? null,
    });
    res.status(201).json({ ok: true, proveedor });
  } catch (error) {
    if (error.code === "23505") {
      throw httpError(409, "Ya existe un proveedor con ese NIT");
    }
    throw error;
  }
});

export const actualizarProveedor = asyncHandler(async (req, res) => {
  const id_proveedor = parseIdProveedor(req.params.id);

  const payload = normalizeProveedorPayload(req.body);
  const validationError = validateProveedorPayload(payload);
  if (validationError) throw httpError(400, validationError);

  const nitExiste = await Proveedor.existsProveedorByNit(payload.nit, id_proveedor);
  if (nitExiste) throw httpError(409, "Ya existe un proveedor con ese NIT");

  try {
    const proveedor = await Proveedor.updateProveedor(
      id_proveedor,
      payload,
      req.user?.id_usuario ?? null
    );
    if (!proveedor) throw httpError(404, "Proveedor no encontrado");
    res.json({ ok: true, proveedor });
  } catch (error) {
    if (error.code === "23505") {
      throw httpError(409, "Ya existe un proveedor con ese NIT");
    }
    throw error;
  }
});

export const eliminarProveedor = asyncHandler(async (req, res) => {
  const id_proveedor = parseIdProveedor(req.params.id);

  const proveedor = await Proveedor.desactivarProveedor(
    id_proveedor,
    req.user?.id_usuario ?? null
  );
  if (!proveedor) {
    throw httpError(404, "Proveedor no encontrado o ya inactivo");
  }
  res.json({ ok: true, proveedor });
});
