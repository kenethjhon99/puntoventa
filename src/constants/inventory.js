export const CATALOGO_GENERAL = "GENERAL";
export const CATALOGO_TIENDA = "TIENDA";
export const CATALOGO_PRODUCTOS_TALLER = "PRODUCTOS_TALLER";

export const BODEGA_GENERAL = "GENERAL";
export const BODEGA_TIENDA_TALLER = "TIENDA_TALLER";

export const BODEGA_GENERAL_VISIBLE = "General";
export const BODEGA_TIENDA_TALLER_VISIBLE = "Tienda / Productos Taller";

export const CATALOGOS_TIENDA_TALLER = [
  CATALOGO_TIENDA,
  CATALOGO_PRODUCTOS_TALLER,
];

export const CATALOGOS_POR_SCOPE = {
  ALL: null,
  GENERAL: [CATALOGO_GENERAL],
  VENTAS: [CATALOGO_GENERAL],
  TIENDA: [CATALOGO_TIENDA, CATALOGO_PRODUCTOS_TALLER],
  PRODUCTOS_TALLER: [CATALOGO_PRODUCTOS_TALLER],
  SERVICIOS: [CATALOGO_PRODUCTOS_TALLER],
  REPARACION: [CATALOGO_PRODUCTOS_TALLER],
};

export const BODEGA_POR_SCOPE = {
  GENERAL: BODEGA_GENERAL,
  VENTAS: BODEGA_GENERAL,
  TIENDA: BODEGA_TIENDA_TALLER,
  PRODUCTOS_TALLER: BODEGA_TIENDA_TALLER,
  SERVICIOS: BODEGA_TIENDA_TALLER,
  REPARACION: BODEGA_TIENDA_TALLER,
};

const LEGACY_BODEGA_ALIASES = {
  PRINCIPAL: BODEGA_GENERAL,
  TIENDA: BODEGA_TIENDA_TALLER,
  PRODUCTOS_TALLER: BODEGA_TIENDA_TALLER,
  SERVICIOS: BODEGA_TIENDA_TALLER,
  TALLER: BODEGA_TIENDA_TALLER,
};

const LEGACY_CATALOGO_ALIASES = {
  SERVICIOS: CATALOGO_PRODUCTOS_TALLER,
  TALLER: CATALOGO_PRODUCTOS_TALLER,
};

export const normalizeCatalogoKey = (value, fallback = CATALOGO_GENERAL) => {
  const key = String(value || fallback || CATALOGO_GENERAL)
    .trim()
    .toUpperCase();

  return LEGACY_CATALOGO_ALIASES[key] || key || CATALOGO_GENERAL;
};

export const normalizeBodegaKey = (value, fallback = BODEGA_GENERAL) => {
  const key = String(value || fallback || BODEGA_GENERAL)
    .trim()
    .toUpperCase();

  return LEGACY_BODEGA_ALIASES[key] || key || BODEGA_GENERAL;
};

export const getCatalogosForScope = (scope = "ALL") => {
  const key = normalizeCatalogoKey(scope, "ALL");
  return Object.prototype.hasOwnProperty.call(CATALOGOS_POR_SCOPE, key)
    ? CATALOGOS_POR_SCOPE[key]
    : null;
};

export const getBodegaKeyForScope = (scope = "GENERAL") => {
  const key = normalizeCatalogoKey(scope, "GENERAL");
  return BODEGA_POR_SCOPE[key] || BODEGA_GENERAL;
};

export const getBodegaKeyForCatalogo = (catalogo = CATALOGO_GENERAL) => {
  const key = normalizeCatalogoKey(catalogo, CATALOGO_GENERAL);
  return key === CATALOGO_GENERAL ? BODEGA_GENERAL : BODEGA_TIENDA_TALLER;
};

export const getBodegaVisibleName = (value) => {
  const key = normalizeBodegaKey(value, BODEGA_GENERAL);
  if (key === BODEGA_TIENDA_TALLER) return BODEGA_TIENDA_TALLER_VISIBLE;
  return BODEGA_GENERAL_VISIBLE;
};

export const isCatalogoTiendaOTaller = (catalogo) =>
  CATALOGOS_TIENDA_TALLER.includes(normalizeCatalogoKey(catalogo));
