// ---------------------------------------------------------------------
// Validador de traslados (solo lectura desde Fase 4b.2).
//
// A partir de Fase 4b.2 los endpoints de creacion y anulacion de
// traslados fueron retirados (responden 410 Gone). Se conserva aqui
// solo la normalizacion del query string del listado historico.
//
// Se eliminaron las funciones:
//   - normalizeTrasladoPayload / validateTrasladoPayload
//   - normalizeAnulacionPayload / validateAnulacionPayload
// ---------------------------------------------------------------------

const normalizeOptionalInteger = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
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
