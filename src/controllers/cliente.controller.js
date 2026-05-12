import * as Cliente from "../models/cliente.model.js";
import { asyncHandler, httpError } from "../utils/asyncHandler.js";

// Refactor a asyncHandler: errores no manejados van al handler global.

const normalizeClientePayload = (body = {}) => ({
  nit: String(body.nit || "").trim() || null,
  nombre: String(body.nombre || "").trim(),
  tipo_cliente: String(body.tipo_cliente || "NORMAL").trim().toUpperCase() || "NORMAL",
  telefono: String(body.telefono || "").trim() || null,
  correo: String(body.correo || "").trim() || null,
  direccion: String(body.direccion || "").trim() || null,
});

const TIPOS_CLIENTE_VALIDOS = new Set(["NORMAL", "MAYORISTA"]);

const parseClienteId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, "id_cliente invalido");
  }
  return id;
};

const assertPayloadValido = (payload) => {
  if (!payload.nombre) throw httpError(400, "nombre es requerido");
  if (!TIPOS_CLIENTE_VALIDOS.has(payload.tipo_cliente)) {
    throw httpError(400, "tipo_cliente invalido");
  }
};

export const listarClientes = asyncHandler(async (req, res) => {
  const clientes = await Cliente.getClientes({
    incluirInactivos:
      String(req.query?.incluirInactivos || "").toLowerCase() === "true",
  });
  res.json({ ok: true, data: clientes });
});

export const crearCliente = asyncHandler(async (req, res) => {
  const payload = normalizeClientePayload(req.body);
  assertPayloadValido(payload);

  if (await Cliente.existsClienteByNit(payload.nit)) {
    throw httpError(409, "Ya existe un cliente con ese NIT");
  }

  try {
    const cliente = await Cliente.createCliente({
      ...payload,
      actorId: req.user?.id_usuario ?? null,
    });
    res.status(201).json({ ok: true, cliente });
  } catch (error) {
    if (error.code === "23505") {
      throw httpError(409, "Registro duplicado en clientes");
    }
    throw error;
  }
});

export const actualizarCliente = asyncHandler(async (req, res) => {
  const id_cliente = parseClienteId(req.params.id);
  const payload = normalizeClientePayload(req.body);
  assertPayloadValido(payload);

  if (await Cliente.existsClienteByNit(payload.nit, id_cliente)) {
    throw httpError(409, "Ya existe un cliente con ese NIT");
  }

  try {
    const cliente = await Cliente.updateCliente(
      id_cliente,
      payload,
      req.user?.id_usuario ?? null
    );
    if (!cliente) throw httpError(404, "Cliente no encontrado");
    res.json({ ok: true, cliente });
  } catch (error) {
    if (error.code === "23505") {
      throw httpError(409, "Registro duplicado en clientes");
    }
    throw error;
  }
});

export const eliminarCliente = asyncHandler(async (req, res) => {
  const id_cliente = parseClienteId(req.params.id);

  const cliente = await Cliente.desactivarCliente(
    id_cliente,
    req.user?.id_usuario ?? null
  );
  if (!cliente) {
    throw httpError(404, "Cliente no encontrado o ya inactivo");
  }
  res.json({ ok: true, cliente });
});
