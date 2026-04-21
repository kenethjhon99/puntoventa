import * as Traslado from "../models/traslado.model.js";
import { normalizeListQuery } from "../validators/traslado.validator.js";

// ---------------------------------------------------------------------
// Traslados: solo lectura desde Fase 4b.2.
//
// Los handlers de creacion, anulacion, listar bodegas y stock por
// bodega fueron retirados junto con sus rutas (ver
// routes/traslado.route.js: ahora responden 410 Gone). Este controller
// expone unicamente los dos GET historicos: listado y detalle.
// ---------------------------------------------------------------------

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
