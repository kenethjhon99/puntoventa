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

export const normalizeEmpleadoPayload = (body = {}) => ({
  nombre: String(body.nombre || "").trim(),
  cargo: String(body.cargo || "").trim().toUpperCase(),
  tipo_pago: String(body.tipo_pago || "").trim().toUpperCase(),
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

  return null;
};

export const buildEmpleadoPersistencePayload = (payload) => ({
  nombre: payload.nombre,
  cargo: payload.cargo,
  tipo_pago: getTipoPagoPorCargo(payload.cargo),
});
