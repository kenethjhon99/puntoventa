const normalizeOptionalInteger = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
};

const normalizeRequiredInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
};

const clampStr = (value, max) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
};

export const normalizeTrasladoPayload = (body = {}) => {
  const items = Array.isArray(body.items) ? body.items : [];

  return {
    id_bodega_origen: normalizeRequiredInteger(body.id_bodega_origen),
    id_bodega_destino: normalizeRequiredInteger(body.id_bodega_destino),
    fecha: body.fecha || null,
    motivo: clampStr(body.motivo, 200),
    observaciones: clampStr(body.observaciones, 500),
    items: items.map((it) => ({
      id_producto: Number(it?.id_producto),
      cantidad: Number(it?.cantidad),
    })),
  };
};

export const validateTrasladoPayload = (payload) => {
  if (!Number.isInteger(payload.id_bodega_origen) || payload.id_bodega_origen <= 0) {
    return "id_bodega_origen invalido";
  }
  if (!Number.isInteger(payload.id_bodega_destino) || payload.id_bodega_destino <= 0) {
    return "id_bodega_destino invalido";
  }
  if (payload.id_bodega_origen === payload.id_bodega_destino) {
    return "La bodega de origen y destino deben ser diferentes";
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return "items es requerido";
  }

  if (payload.items.length > 500) {
    return "Demasiados items en un solo traslado (max 500)";
  }

  const invalid = payload.items.find((it) => {
    const idp = Number(it?.id_producto);
    const c = Number(it?.cantidad);
    return (
      !Number.isInteger(idp) ||
      idp <= 0 ||
      !Number.isInteger(c) ||
      c <= 0
    );
  });
  if (invalid) {
    return "Items invalidos (id_producto y cantidad deben ser enteros > 0)";
  }

  return null;
};

export const normalizeAnulacionPayload = (body = {}) => ({
  motivo: clampStr(body.motivo, 200),
});

export const validateAnulacionPayload = (payload) => {
  if (!payload.motivo || payload.motivo.length < 3) {
    return "Debes indicar un motivo de anulacion (min 3 caracteres)";
  }
  return null;
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
