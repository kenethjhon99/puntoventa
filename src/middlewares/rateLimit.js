import rateLimit from "express-rate-limit";

// ---------------------------------------------------------------------
// Rate limiters reutilizables.
//
// Ojo: en produccion detras de un proxy (nginx, Cloudflare, etc.),
// asegurate de configurar `app.set("trust proxy", 1)` en app.js para
// que req.ip sea la IP real del cliente y no la del proxy. Sin eso,
// todas las requests parecen venir de la misma IP y el limiter se
// vuelve un DoS para todos.
// ---------------------------------------------------------------------

/**
 * Rate limit para el endpoint de login.
 *
 *   - 5 intentos por IP en 15 minutos.
 *   - Solo cuentan los intentos fallidos (skipSuccessfulRequests):
 *     un usuario legitimo que escribio mal una vez no se autobloquea
 *     en cuanto entra correctamente.
 *   - Devuelve 429 con mensaje claro al cliente.
 *
 * Mitiga: fuerza bruta de passwords, credential stuffing.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false,  // X-RateLimit-* desactivados
  skipSuccessfulRequests: true,
  message: {
    error:
      "Demasiados intentos de inicio de sesion. Intenta de nuevo en 15 minutos.",
  },
});
