import * as Traslado from "../models/traslado.model.js";
import {
  normalizeListQuery,
  normalizeTrasladoPayload,
  validateTrasladoPayload,
} from "../validators/traslado.validator.js";

export const listarTraslados = async (req, res) => {
  try {
    const query = normalizeListQuery(req.query);
    const result = await Traslado.listarTraslados(query);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const getTraslado = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: "id invalido" });
    }

    const data = await Traslado.getTrasladoCompleto(Number(id));
    if (!data) {
      return res.status(404).json({ error: "Traslado no encontrado" });
    }

    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const listarBodegasTraslado = async (_req, res) => {
  try {
    const data = await Traslado.listarBodegasTraslado();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const listarProductosBodegaOrigen = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: "id de bodega invalido" });
    }

    const data = await Traslado.listarProductosBodegaOrigen(Number(id), {
      q: req.query.q,
    });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const crearTraslado = async (req, res) => {
  try {
    const payload = normalizeTrasladoPayload(req.body);
    const validationError = validateTrasladoPayload(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const data = await Traslado.crearTraslado({
      ...payload,
      id_usuario: req.user.id_usuario,
    });

    res.status(201).json({ ok: true, ...data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
