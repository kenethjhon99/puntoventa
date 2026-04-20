const normalizeUpper = (value, fallback) =>
  String(value || fallback || "")
    .trim()
    .toUpperCase();

const normalizeOptionalInteger = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
};

const normalizeOptionalNumber = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

export const normalizeVentaPayload = (body = {}) => ({
  items: Array.isArray(body.items) ? body.items : [],
  tipo_venta: normalizeUpper(body.tipo_venta, "CONTADO") || "CONTADO",
  metodo_pago: normalizeUpper(body.metodo_pago, "EFECTIVO") || "EFECTIVO",
  id_sucursal: normalizeOptionalInteger(body.id_sucursal) ?? 1,
  id_cliente: normalizeOptionalInteger(body.id_cliente),
  tipo_comprobante: normalizeUpper(body.tipo_comprobante, "TICKET") || "TICKET",
  monto_recibido: normalizeOptionalNumber(body.monto_recibido),
  no_cobrar: Boolean(body.no_cobrar),
  no_cobrado_motivo: String(body.no_cobrado_motivo || "").trim() || null,
  descuento_porcentaje:
    body.descuento_porcentaje == null || body.descuento_porcentaje === ""
      ? 0
      : Number(body.descuento_porcentaje),
  id_empleado_credito: normalizeOptionalInteger(body.id_empleado_credito),
  observacion_credito:
    String(body.observacion_credito || "").trim().slice(0, 250) || null,
});

export const validateVentaPayload = (payload) => {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return "items es requerido";
  }

  if (!Number.isInteger(payload.id_sucursal) || payload.id_sucursal <= 0) {
    return "id_sucursal invalido";
  }

  if (payload.id_cliente !== null && (!Number.isInteger(payload.id_cliente) || payload.id_cliente <= 0)) {
    return "id_cliente invalido";
  }

  if (
    payload.id_empleado_credito !== null &&
    (!Number.isInteger(payload.id_empleado_credito) || payload.id_empleado_credito <= 0)
  ) {
    return "id_empleado_credito invalido";
  }

  if (payload.id_empleado_credito && payload.id_cliente) {
    return "No se puede registrar venta a credito a empleado con cliente asignado";
  }

  if (payload.id_empleado_credito && payload.no_cobrar) {
    return "Credito a empleado no es compatible con venta no cobrada";
  }

  if (payload.id_empleado_credito && payload.descuento_porcentaje > 0) {
    return "No se aplica descuento en venta a credito a empleado";
  }

  if (payload.monto_recibido !== null && (!Number.isFinite(payload.monto_recibido) || payload.monto_recibido < 0)) {
    return "monto_recibido debe ser un numero mayor o igual a 0";
  }

  if (!Number.isFinite(payload.descuento_porcentaje)) {
    return "descuento_porcentaje debe ser un numero valido";
  }

  if (payload.descuento_porcentaje < 0 || payload.descuento_porcentaje > 100) {
    return "descuento_porcentaje debe estar entre 0 y 100";
  }

  if (payload.descuento_porcentaje > 0 && !payload.id_cliente) {
    return "Debes seleccionar un cliente para aplicar descuento";
  }

  if (payload.no_cobrar && !payload.no_cobrado_motivo) {
    return "Debes indicar el motivo del no cobro";
  }

  const invalidItem = payload.items.find((item) => {
    const idProducto = Number(item?.id_producto);
    const cantidad = Number(item?.cantidad);
    return !Number.isInteger(idProducto) || idProducto <= 0 || !Number.isInteger(cantidad) || cantidad <= 0;
  });

  if (invalidItem) {
    return "Items invalidos (id_producto y cantidad deben ser enteros > 0)";
  }

  return null;
};

