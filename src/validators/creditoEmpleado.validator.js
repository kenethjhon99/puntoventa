export const ESTADOS_CREDITO_EMPLEADO = Object.freeze({
  PENDIENTE: "PENDIENTE",
  COBRADO: "COBRADO",
  CANCELADO: "CANCELADO",
});

export const CRITICIDADES_CREDITO_EMPLEADO = Object.freeze({
  VENCIDO: "VENCIDO",
  POR_VENCER: "POR_VENCER",
  VIGENTE: "VIGENTE",
});

const parsePositiveInt = (value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const normalizeListQuery = (query = {}) => ({
  estado: query.estado
    ? String(query.estado).trim().toUpperCase()
    : null,
  id_empleado: parsePositiveInt(query.id_empleado),
  desde: query.desde ? String(query.desde).trim() : null,
  hasta: query.hasta ? String(query.hasta).trim() : null,
  criticidad: query.criticidad
    ? String(query.criticidad).trim().toUpperCase()
    : null,
  page: parsePositiveInt(query.page) ?? 1,
  limit: Math.min(parsePositiveInt(query.limit) ?? 25, 200),
});

export const validateListQuery = (payload) => {
  if (
    payload.estado &&
    !Object.values(ESTADOS_CREDITO_EMPLEADO).includes(payload.estado)
  ) {
    return `estado invalido. Debe ser ${Object.values(ESTADOS_CREDITO_EMPLEADO).join(", ")}`;
  }

  if (
    payload.criticidad &&
    !Object.values(CRITICIDADES_CREDITO_EMPLEADO).includes(payload.criticidad)
  ) {
    return `criticidad invalida. Debe ser ${Object.values(CRITICIDADES_CREDITO_EMPLEADO).join(", ")}`;
  }

  return null;
};

export const normalizeCobrarPayload = (body = {}) => ({
  nota: body.nota ? String(body.nota).trim().slice(0, 250) : null,
});

export const normalizeCondonarPayload = (body = {}) => ({
  motivo: String(body.motivo || "").trim().slice(0, 250),
});

export const validateCondonarPayload = (payload) => {
  if (!payload.motivo || payload.motivo.length < 5) {
    return "motivo de condonacion es requerido (minimo 5 caracteres)";
  }
  return null;
};
