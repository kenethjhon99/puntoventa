const TELEFONO_RE = /^[0-9+\-()\s]{6,25}$/;
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NIT_RE = /^(CF|[0-9]{6,12}(-?[0-9Kk])?)$/;

const norm = (value) => String(value ?? "").trim();
const normOrNull = (value) => norm(value) || null;

export const normalizeProveedorPayload = (body = {}) => ({
  nombre_empresa: norm(body.nombre_empresa),
  telefono_empresa: normOrNull(body.telefono_empresa),
  nombre_viajero: normOrNull(body.nombre_viajero),
  telefono_viajero: normOrNull(body.telefono_viajero),
  nit: norm(body.nit).toUpperCase(),
  correo: normOrNull(body.correo),
  direccion: normOrNull(body.direccion),
});

export const validateProveedorPayload = (payload) => {
  if (!payload.nombre_empresa) {
    return "nombre_empresa es requerido";
  }

  if (payload.nombre_empresa.length > 100) {
    return "nombre_empresa no puede exceder 100 caracteres";
  }

  if (!payload.nit) {
    return "nit es requerido";
  }

  if (!NIT_RE.test(payload.nit)) {
    return "nit invalido (use CF o formato 1234567-8)";
  }

  if (payload.telefono_empresa && !TELEFONO_RE.test(payload.telefono_empresa)) {
    return "telefono_empresa invalido";
  }

  if (payload.telefono_viajero && !TELEFONO_RE.test(payload.telefono_viajero)) {
    return "telefono_viajero invalido";
  }

  if (payload.nombre_viajero && payload.nombre_viajero.length > 100) {
    return "nombre_viajero no puede exceder 100 caracteres";
  }

  if (payload.correo && !CORREO_RE.test(payload.correo)) {
    return "correo invalido";
  }

  if (payload.direccion && payload.direccion.length > 200) {
    return "direccion no puede exceder 200 caracteres";
  }

  return null;
};
