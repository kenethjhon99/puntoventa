export const CARGOS_EMPLEADO = Object.freeze({
  CARWASH: "CARWASH",
  VENDEDOR: "VENDEDOR",
});

export const TIPOS_PAGO_EMPLEADO = Object.freeze({
  SEMANAL: "SEMANAL",
  MENSUAL: "MENSUAL",
});

const TIPO_PAGO_POR_CARGO = Object.freeze({
  [CARGOS_EMPLEADO.CARWASH]: TIPOS_PAGO_EMPLEADO.SEMANAL,
  [CARGOS_EMPLEADO.VENDEDOR]: TIPOS_PAGO_EMPLEADO.MENSUAL,
});

export const getTipoPagoPorCargo = (cargo) => {
  const normalizedCargo = String(cargo || "").trim().toUpperCase();
  return TIPO_PAGO_POR_CARGO[normalizedCargo] || null;
};

const parseNumber = (value) => {
  if (value == null || value === "") return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};

const parseInteger = (value) => {
  if (value == null || value === "") return NaN;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
};

export const normalizeEmpleadoPayload = (body = {}) => ({
  nombre: String(body.nombre || "").trim(),
  cargo: String(body.cargo || "").trim().toUpperCase(),
  tipo_pago: String(body.tipo_pago || "").trim().toUpperCase(),
  sueldo: parseNumber(body.sueldo),
  dia_pago: parseInteger(body.dia_pago),
});

export const validateEmpleadoPayload = (payload) => {
  if (!payload.nombre) {
    return "nombre es requerido";
  }

  if (!Object.values(CARGOS_EMPLEADO).includes(payload.cargo)) {
    return "cargo invalido. Debe ser CARWASH o VENDEDOR";
  }

  const tipoPagoEsperado = getTipoPagoPorCargo(payload.cargo);

  if (payload.tipo_pago && payload.tipo_pago !== tipoPagoEsperado) {
    return `tipo_pago invalido para ${payload.cargo}. Debe ser ${tipoPagoEsperado}`;
  }

  if (!Number.isFinite(payload.sueldo) || payload.sueldo < 0) {
    return "sueldo debe ser un numero mayor o igual a 0";
  }

  if (!Number.isInteger(payload.dia_pago)) {
    return "dia_pago es requerido";
  }

  if (tipoPagoEsperado === TIPOS_PAGO_EMPLEADO.SEMANAL) {
    if (payload.dia_pago < 1 || payload.dia_pago > 7) {
      return "dia_pago semanal debe estar entre 1 (lunes) y 7 (domingo)";
    }
  } else if (tipoPagoEsperado === TIPOS_PAGO_EMPLEADO.MENSUAL) {
    if (payload.dia_pago < 0 || payload.dia_pago > 28) {
      return "dia_pago mensual debe estar entre 1 y 28 (o 0 para ultimo dia del mes)";
    }
  }

  return null;
};

export const buildEmpleadoPersistencePayload = (payload) => ({
  nombre: payload.nombre,
  cargo: payload.cargo,
  tipo_pago: getTipoPagoPorCargo(payload.cargo),
  sueldo: Number(payload.sueldo.toFixed(2)),
  dia_pago: payload.dia_pago,
});
