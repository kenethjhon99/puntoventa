// ---------------------------------------------------------------------
// asyncHandler: wrapper para handlers async de Express.
//
// El patron repetido en los controllers de este proyecto es:
//
//   export const algo = async (req, res) => {
//     try {
//       const data = await Model.algo(...);
//       res.json({ ok: true, data });
//     } catch (e) {
//       res.status(500).json({ error: e.message }); //  filtra detalles
//     }
//   };
//
// Problemas:
//   - El catch puede filtrar mensajes internos al cliente.
//   - Cada controller decide su propio statusCode (a menudo 500 hasta
//     para errores que en realidad son 400/404).
//   - No pasa por el handler global de app.js, asi que la logica de
//     formato de error queda fragmentada.
//
// asyncHandler delega el error al `next` de Express, que lo entrega al
// handler global de app.js. Alli se aplica la politica unica:
//   - prod: mensaje generico + requestId.
//   - dev:  mensaje original.
//
// Uso:
//   export const algo = asyncHandler(async (req, res) => {
//     const data = await Model.algo(...);
//     res.json({ ok: true, data });
//   });
//
// Si necesitas un statusCode distinto a 500, lanza un Error con
// `error.statusCode = 404` (o 400, etc) — el handler global lo respeta.
//
// MIGRACION (deuda pendiente):
//   Hay ~53 sitios usando el patron viejo `res.status(500).json({ error: e.message })`
//   en 15 controllers. Adoptar este wrapper de forma progresiva, archivo
//   por archivo, validando que el flujo de error siga teniendo sentido
//   (algunos controllers diferencian 400 vs 500 segun el tipo de excepcion).
// ---------------------------------------------------------------------

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Lanza un Error con statusCode tipado para que el handler global
 * responda con el codigo HTTP correcto. Util cuando estas adentro de
 * un asyncHandler y necesitas un 400/404/409.
 */
export const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};
