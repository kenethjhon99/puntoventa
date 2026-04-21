const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

// Valores validos para el campo "catalogo".
const isValidCatalogo = (value) =>
  ["GENERAL", "TIENDA", "PRODUCTOS_TALLER"].includes(value);

// Legacy input: si un cliente aun envia modulo_origen, lo aceptamos y lo
// traducimos a catalogo (pero ya no persistimos el campo modulo_origen).
const isValidModuloOrigenLegacy = (value) =>
  ["GENERAL", "SERVICIOS"].includes(value);

const catalogoDesdeModuloOrigen = (moduloOrigen) => {
  const norm = String(moduloOrigen || "").trim().toUpperCase();
  if (norm === "SERVICIOS") return "PRODUCTOS_TALLER";
  return "GENERAL";
};

export const validateProductoCreate = (body) => {
  const errors = [];
  const data = {};

  if (body.codigo_barras !== undefined) {
    if (typeof body.codigo_barras !== "string" || body.codigo_barras.trim() === "") {
      errors.push("codigo_barras debe ser string no vacio");
    } else {
      data.codigo_barras = body.codigo_barras.trim();
    }
  }

  if (typeof body.nombre !== "string" || body.nombre.trim().length < 2) {
    errors.push("nombre es requerido (minimo 2 caracteres)");
  } else {
    data.nombre = body.nombre.trim();
  }

  if (body.descripcion !== undefined) {
    if (typeof body.descripcion !== "string") {
      errors.push("descripcion debe ser string");
    } else {
      data.descripcion = body.descripcion.trim();
    }
  }

  if (!isNumber(body.precio_compra) || body.precio_compra < 0) {
    errors.push("precio_compra es requerido y debe ser numero >= 0");
  } else {
    data.precio_compra = body.precio_compra;
  }

  if (!isNumber(body.precio_venta) || body.precio_venta < 0) {
    errors.push("precio_venta es requerido y debe ser numero >= 0");
  } else {
    data.precio_venta = body.precio_venta;
  }

  if (
    isNumber(body.precio_compra) &&
    isNumber(body.precio_venta) &&
    body.precio_venta < body.precio_compra
  ) {
    errors.push("precio_venta no puede ser menor que precio_compra");
  }

  // catalogo tiene prioridad. Si solo llega modulo_origen (legacy), se traduce.
  if (body.catalogo !== undefined) {
    const catalogo = String(body.catalogo || "").trim().toUpperCase();
    if (!isValidCatalogo(catalogo)) {
      errors.push("catalogo debe ser GENERAL, TIENDA o PRODUCTOS_TALLER");
    } else {
      data.catalogo = catalogo;
    }
  } else if (body.modulo_origen !== undefined) {
    const moduloOrigen = String(body.modulo_origen || "").trim().toUpperCase();
    if (!isValidModuloOrigenLegacy(moduloOrigen)) {
      errors.push("modulo_origen debe ser GENERAL o SERVICIOS");
    } else {
      data.catalogo = catalogoDesdeModuloOrigen(moduloOrigen);
    }
  }

  if (body.stock_minimo !== undefined) {
    if (!Number.isInteger(body.stock_minimo) || body.stock_minimo < 0) {
      errors.push("stock_minimo debe ser entero >= 0");
    } else {
      data.stock_minimo = body.stock_minimo;
    }
  }

  if (body.ubicacion !== undefined) {
    if (body.ubicacion !== null && typeof body.ubicacion !== "string") {
      errors.push("ubicacion debe ser string o null");
    } else {
      data.ubicacion = body.ubicacion?.trim() || null;
    }
  }

  return { ok: errors.length === 0, errors, data };
};

export const validateProductoUpdate = (body) => {
  const allowed = [
    "codigo_barras",
    "nombre",
    "descripcion",
    "precio_compra",
    "precio_venta",
    "catalogo",
    "modulo_origen", // legacy: se traduce y no se persiste
    "stock_minimo",
    "ubicacion",
  ];

  const errors = [];
  const data = {};

  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      errors.push(`Campo no permitido: ${key}`);
    }
  }

  if (errors.length) return { ok: false, errors, data };

  if (body.codigo_barras !== undefined) {
    if (typeof body.codigo_barras !== "string" || body.codigo_barras.trim() === "") {
      errors.push("codigo_barras debe ser string no vacio");
    } else {
      data.codigo_barras = body.codigo_barras.trim();
    }
  }

  if (body.nombre !== undefined) {
    if (typeof body.nombre !== "string" || body.nombre.trim().length < 2) {
      errors.push("nombre debe tener minimo 2 caracteres");
    } else {
      data.nombre = body.nombre.trim();
    }
  }

  if (body.descripcion !== undefined) {
    if (typeof body.descripcion !== "string") {
      errors.push("descripcion debe ser string");
    } else {
      data.descripcion = body.descripcion.trim();
    }
  }

  if (body.precio_compra !== undefined) {
    if (!isNumber(body.precio_compra) || body.precio_compra < 0) {
      errors.push("precio_compra debe ser numero >= 0");
    } else {
      data.precio_compra = body.precio_compra;
    }
  }

  if (body.precio_venta !== undefined) {
    if (!isNumber(body.precio_venta) || body.precio_venta < 0) {
      errors.push("precio_venta debe ser numero >= 0");
    } else {
      data.precio_venta = body.precio_venta;
    }
  }

  // catalogo tiene prioridad. modulo_origen legacy se traduce a catalogo
  // pero ya no se persiste.
  if (body.catalogo !== undefined) {
    const catalogo = String(body.catalogo || "").trim().toUpperCase();
    if (!isValidCatalogo(catalogo)) {
      errors.push("catalogo debe ser GENERAL, TIENDA o PRODUCTOS_TALLER");
    } else {
      data.catalogo = catalogo;
    }
  } else if (body.modulo_origen !== undefined) {
    const moduloOrigen = String(body.modulo_origen || "").trim().toUpperCase();
    if (!isValidModuloOrigenLegacy(moduloOrigen)) {
      errors.push("modulo_origen debe ser GENERAL o SERVICIOS");
    } else {
      data.catalogo = catalogoDesdeModuloOrigen(moduloOrigen);
    }
  }

  if (
    data.precio_compra !== undefined &&
    data.precio_venta !== undefined &&
    data.precio_venta < data.precio_compra
  ) {
    errors.push("precio_venta no puede ser menor que precio_compra");
  }

  if (body.stock_minimo !== undefined) {
    if (!Number.isInteger(body.stock_minimo) || body.stock_minimo < 0) {
      errors.push("stock_minimo debe ser entero >= 0");
    } else {
      data.stock_minimo = body.stock_minimo;
    }
  }

  if (body.ubicacion !== undefined) {
    if (body.ubicacion !== null && typeof body.ubicacion !== "string") {
      errors.push("ubicacion debe ser string o null");
    } else {
      data.ubicacion = body.ubicacion?.trim() || null;
    }
  }

  if (Object.keys(data).length === 0 && errors.length === 0) {
    errors.push("No enviaste campos para actualizar");
  }

  return { ok: errors.length === 0, errors, data };
};
