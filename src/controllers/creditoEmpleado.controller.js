import * as CreditoEmpleado from "../models/creditoEmpleado.model.js";
import {
  normalizeListQuery,
  validateListQuery,
  normalizeCobrarPayload,
  normalizeCondonarPayload,
  validateCondonarPayload,
} from "../validators/creditoEmpleado.validator.js";

const parsePositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const listarCreditos = async (req, res) => {
  try {
    const query = normalizeListQuery(req.query);
    const validationError = validateListQuery(query);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const result = await CreditoEmpleado.listarCreditos(query);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getCredito = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "id_credito_empleado invalido" });
    }

    const credito = await CreditoEmpleado.getCreditoById(id);
    if (!credito) {
      return res.status(404).json({ error: "Credito no encontrado" });
    }

    res.json({ ok: true, credito });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAlertas = async (_req, res) => {
  try {
    const data = await CreditoEmpleado.getAlertasAdmin();
    res.json({ ok: true, ...data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getNominaProxima = async (_req, res) => {
  try {
    const data = await CreditoEmpleado.getNominaProxima();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const cobrarCredito = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "id_credito_empleado invalido" });
    }

    const payload = normalizeCobrarPayload(req.body);
    const credito = await CreditoEmpleado.cobrarCredito({
      id_credito_empleado: id,
      nota: payload.nota,
      id_usuario: req.user?.id_usuario ?? null,
    });

    res.json({ ok: true, credito });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const condonarCredito = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "id_credito_empleado invalido" });
    }

    const payload = normalizeCondonarPayload(req.body);
    const validationError = validateCondonarPayload(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const credito = await CreditoEmpleado.condonarCredito({
      id_credito_empleado: id,
      motivo: payload.motivo,
      id_usuario: req.user?.id_usuario ?? null,
    });

    res.json({ ok: true, credito });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
