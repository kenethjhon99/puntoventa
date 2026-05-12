// ---------------------------------------------------------------------
// Helpers de paginacion.
//
// Centraliza el clampeo de `page` y `limit` para todos los listados.
// Sin esto cada modelo o validator tiene su propia logica copy/paste
// con bugs sutiles:
//
//   - `limit=-50` se cuela como negativo al SQL si solo hay `|| 20`.
//   - `limit=1.5` se cuela como float -> Postgres rechaza `LIMIT 1.5`
//     con syntax error.
//   - `limit=Infinity` o `limit=NaN` rompen el SQL.
//
// Estos helpers garantizan: entero positivo dentro de un rango.
// ---------------------------------------------------------------------

const toPositiveInt = (value, fallback) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Normaliza el numero de pagina.
 *   - >= 1, entero.
 *   - Cualquier basura (NaN, negativo, float, undefined) cae al default.
 */
export const clampPage = (value, fallback = 1) =>
  toPositiveInt(value, fallback);

/**
 * Normaliza el limite por pagina.
 *   - Entre 1 y `max` (default 100), entero.
 *   - Basura cae al default. Valores arriba de `max` se clampean a `max`.
 */
export const clampLimit = (value, { defaultLimit = 20, max = 100 } = {}) => {
  const n = toPositiveInt(value, defaultLimit);
  return Math.min(max, n);
};
