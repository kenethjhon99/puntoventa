import * as Empleado from "../models/empleado.model.js";
import {
  buildEmpleadoPersistencePayload,
  normalizeEmpleadoPayload,
  validateEmpleadoPayload,
} from "../validators/empleado.validator.js";

const parseEmpleadoId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const listarEmpleados = async (req, res) => {
  try {
    const empleados = await Empleado.getEmpleados({
      incluirInactivos: String(req.query?.incluirInactivos || "").toLowerCase() === "true",
    });

    res.json({ ok: true, data: empleados });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const crearEmpleado = async (req, res) => {
  try {
    const payload = normalizeEmpleadoPayload(req.body);
    const validationError = validateEmpleadoPayload(payload);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const empleado = await Empleado.createEmpleado({
      ...buildEmpleadoPersistencePayload(payload),
      actorId: req.user?.id_usuario ?? null,
    });

    res.status(201).json({ ok: true, empleado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const actualizarEmpleado = async (req, res) => {
  try {
    const id_empleado = parseEmpleadoId(req.params.id);

    if (!id_empleado) {
      return res.status(400).json({ error: "id_empleado invalido" });
    }

    const payload = normalizeEmpleadoPayload(req.body);
    const validationError = validateEmpleadoPayload(payload);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const empleado = await Empleado.updateEmpleado(
      id_empleado,
      buildEmpleadoPersistencePayload(payload),
      req.user?.id_usuario ?? null
    );

    if (!empleado) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }

    res.json({ ok: true, empleado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const desactivarEmpleado = async (req, res) => {
  try {
    const id_empleado = parseEmpleadoId(req.params.id);

    if (!id_empleado) {
      return res.status(400).json({ error: "id_empleado invalido" });
    }

    const empleado = await Empleado.desactivarEmpleado(
      id_empleado,
      req.user?.id_usuario ?? null
    );

    if (!empleado) {
      return res.status(404).json({ error: "Empleado no encontrado o ya inactivo" });
    }

    res.json({ ok: true, empleado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const activarEmpleado = async (req, res) => {
  try {
    const id_empleado = parseEmpleadoId(req.params.id);

    if (!id_empleado) {
      return res.status(400).json({ error: "id_empleado invalido" });
    }

    const empleado = await Empleado.activarEmpleado(
      id_empleado,
      req.user?.id_usuario ?? null
    );

    if (!empleado) {
      return res.status(404).json({ error: "Empleado no encontrado o ya activo" });
    }

    res.json({ ok: true, empleado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
