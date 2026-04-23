const normalizeOptionalInteger = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
};

const normalizeOptionalText = (value, maxLength = 500) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
};

export const normalizeListQuery = (query = {}) => ({
  desde: query.desde || null,
  hasta: query.hasta || null,
  estado: query.estado || null,
  id_bodega_origen: normalizeOptionalInteger(query.id_bodega_origen),
  id_bodega_destino: normalizeOptionalInteger(query.id_bodega_destino),
  id_usuario: normalizeOptionalInteger(query.id_usuario),
  id_producto: normalizeOptionalInteger(query.id_producto),
  page: Number(query.page) || 1,
  limit: Number(query.limit) || 20,
  sortBy: query.sortBy || "fecha",
  sortDir: query.sortDir || "desc",
});

export const normalizeTrasladoPayload = (body = {}) => ({
  id_bodega_origen: normalizeOptionalInteger(body.id_bodega_origen),
  id_bodega_destino: normalizeOptionalInteger(body.id_bodega_destino),
  motivo: normalizeOptionalText(body.motivo, 250),
  observaciones: normalizeOptionalText(body.observaciones, 500),
  detalle: Array.isArray(body.detalle)
    ? body.detalle.map((item) => ({
        id_producto: normalizeOptionalInteger(item?.id_producto),
        cantidad: normalizeOptionalInteger(item?.cantidad),
      }))
    : [],
});

export const validateTrasladoPayload = (payload) => {
  if (
    !Number.isInteger(payload.id_bodega_origen) ||
    payload.id_bodega_origen <= 0
  ) {
    return "Debes indicar una bodega origen valida";
  }

  if (
    !Number.isInteger(payload.id_bodega_destino) ||
    payload.id_bodega_destino <= 0
  ) {
    return "Debes indicar una bodega destino valida";
  }

  if (payload.id_bodega_origen === payload.id_bodega_destino) {
    return "La bodega origen y destino no pueden ser iguales";
  }

  if (!Array.isArray(payload.detalle) || payload.detalle.length === 0) {
    return "Debes agregar al menos un producto al traslado";
  }

  const seen = new Set();
  for (const item of payload.detalle) {
    if (!Number.isInteger(item.id_producto) || item.id_producto <= 0) {
      return "Todos los productos del traslado deben ser validos";
    }

    if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
      return "Todas las cantidades del traslado deben ser enteros mayores a 0";
    }

    if (seen.has(item.id_producto)) {
      return "No se permiten productos duplicados en el detalle";
    }

    seen.add(item.id_producto);
  }

  return null;
};
