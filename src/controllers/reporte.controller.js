import * as R from "../models/reporte.model.js";

export const corteVentas = async (req, res) => {
  try {
    const { desde, hasta, id_sucursal, id_usuario } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ error: "desde y hasta son obligatorios (YYYY-MM-DD)" });
    }

    const data = await R.corteVentas({
      desde,
      hasta,
      id_sucursal: id_sucursal ?? 1,
      id_usuario: id_usuario ?? null
    });

    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const corteVentasDetallado = async (req, res) => {
  try {
    const { desde, hasta, id_sucursal, id_usuario, page, limit, top } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ error: "desde y hasta son obligatorios (YYYY-MM-DD)" });
    }

    const data = await R.corteVentasDetallado({
      desde,
      hasta,
      id_sucursal: id_sucursal ?? 1,
      id_usuario: id_usuario ?? null,
      page,
      limit,
      top,
    });

    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const corteVentasDetalladoPro = async (req, res) => {
  try {
    const { desde, hasta, id_sucursal, id_usuario, page, limit, top } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ error: "desde y hasta son obligatorios (YYYY-MM-DD)" });
    }

    const data = await R.corteVentasDetalladoPro({
      desde,
      hasta,
      id_sucursal: id_sucursal ?? 1,
      id_usuario: id_usuario ?? null,
      page,
      limit,
      top,
    });

    const chart_data = {
      metodo_pago: toChart(data.por_metodo_pago, "metodo_pago", "total_neto"),
      tipo_venta: toChart(data.por_tipo_venta, "tipo_venta", "total_neto"),
      top_total: toChart(data.top_productos_por_total, "producto_nombre", "total_neto"),
      top_cantidad: toChart(data.top_productos_por_cantidad, "producto_nombre", "cantidad_vendida_neta"),
    };
    
    res.json({ ok: true, ...data, chart_data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

