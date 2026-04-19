import * as Traslado from "../models/traslado.model.js";
import {
  normalizeTrasladoPayload,
  validateTrasladoPayload,
  normalizeAnulacionPayload,
  validateAnulacionPayload,
  normalizeListQuery,
} from "../validators/traslado.validator.js";

export const crearTraslado = async (req, res) => {
  try {
    const payload = normalizeTrasladoPayload(req.body);
    const error = validateTrasladoPayload(payload);
    if (error) return res.status(400).json({ error });

    const traslado = await Traslado.crearTraslado({
      ...payload,
      id_usuario: req.user.id_usuario,
    });

    res.status(201).json({ ok: true, traslado });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

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
    if (!data) return res.status(404).json({ error: "Traslado no encontrado" });

    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const anularTraslado = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: "id invalido" });
    }

    const payload = normalizeAnulacionPayload(req.body);
    const error = validateAnulacionPayload(payload);
    if (error) return res.status(400).json({ error });

    const result = await Traslado.anularTraslado({
      id_traslado: Number(id),
      motivo: payload.motivo,
      id_usuario: req.user.id_usuario,
    });

    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const listarBodegas = async (_req, res) => {
  try {
    const data = await Traslado.listarBodegas();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const stockBodega = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: "id invalido" });
    }
    const data = await Traslado.stockBodega(Number(id));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
