const TELEFONO_RE = /^[0-9+\-()\s]{6,25}$/;
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NIT_RE = /^(CF|[0-9]{6,12}(-?[0-9Kk])?)$/;

const norm = (value) => String(value ?? "").trim();
const normOrNull = (value) => norm(value) || null;

export const normalizeProveedorPayload = (body = {}) => {
  const nombre = norm(body.nombre ?? body.nombre_empresa);
  const telefono = normOrNull(body.telefono ?? body.telefono_empresa);

  return {
    nombre,
    telefono,
    nit: norm(body.nit).toUpperCase(),
    correo: normOrNull(body.correo),
    direccion: normOrNull(body.direccion),
  };
};

export const validateProveedorPayload = (payload) => {
  if (!payload.nombre) {
    return "nombre es requerido";
  }

  if (payload.nombre.length > 100) {
    return "nombre no puede exceder 100 caracteres";
  }

  if (!payload.nit) {
    return "nit es requerido";
  }

  if (!NIT_RE.test(payload.nit)) {
    return "nit invalido (use CF o formato 1234567-8)";
  }

  if (payload.telefono && !TELEFONO_RE.test(payload.telefono)) {
    return "telefono invalido";
  }

  if (payload.correo && !CORREO_RE.test(payload.correo)) {
    return "correo invalido";
  }

  if (payload.direccion && payload.direccion.length > 200) {
    return "direccion no puede exceder 200 caracteres";
  }

  return null;
};
