import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pool } from "./config/db.js";
import { logger } from "./utils/logger.js";
import productoRouter from "./routes/producto.route.js";
import stockRouter from "./routes/stock.route.js";
import authRouter from "./routes/auth.route.js";
import rolRouter from "./routes/rol.route.js";
import usuarioRouter from "./routes/usuario.route.js";
import { auth } from "./middlewares/auth.js";
import ventaRouter from "./routes/venta.route.js";
import { formatDates } from "./middlewares/formatDates.js";
import reporteRouter from "./routes/reporte.route.js";
import compraRouter from "./routes/compra.route.js";
import proveedorRouter from "./routes/proveedor.route.js";
import clienteRouter from "./routes/cliente.route.js";
import cajaRouter from "./routes/caja.route.js";
import servicioRouter from "./routes/servicio.route.js";
import empleadoRouter from "./routes/empleado.route.js";
import trasladoRouter from "./routes/traslado.route.js";
import creditoEmpleadoRouter from "./routes/creditoEmpleado.route.js";

const parseAllowedOrigins = () => {
  const envOrigins = [
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(["http://localhost:5173", ...envOrigins]);
};

const isAllowedVercelPreview = (origin) => {
  if (process.env.CORS_ALLOW_VERCEL_PREVIEWS !== "true") return false;

  try {
    const { hostname } = new URL(origin);
    return hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
};

const app = express();

// trust proxy: cuando la app corre detras de un reverse proxy (nginx,
// Cloudflare, Vercel, etc.), Express tiene que confiar en headers
// X-Forwarded-For / X-Forwarded-Proto para que req.ip apunte al
// cliente real y no al proxy. Sin esto, el rate-limiter ve a todos
// los usuarios bajo la misma IP (la del proxy) y bloquea masivamente.
//
// TRUST_PROXY puede ser:
//   - "1"     -> confia en 1 hop de proxy (lo mas comun)
//   - "true"  -> confia en cualquier proxy (menos seguro)
//   - "1.2.3.4" -> confia solo en esa IP de proxy
//   - vacio / no seteado -> no confia en ningun proxy (default seguro
//     para desarrollo local sin proxy).
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  const numeric = Number(trustProxy);
  if (Number.isInteger(numeric) && numeric > 0) {
    app.set("trust proxy", numeric);
  } else if (trustProxy === "true") {
    app.set("trust proxy", true);
  } else {
    app.set("trust proxy", trustProxy);
  }
  console.log(`[app] trust proxy configurado: ${trustProxy}`);
}

// Helmet aplica un set sensato de headers HTTP de seguridad:
//   - X-Content-Type-Options: nosniff
//   - X-Frame-Options: SAMEORIGIN (previene clickjacking)
//   - Strict-Transport-Security en HTTPS
//   - Referrer-Policy
//   - etc.
// CSP (Content-Security-Policy) lo dejamos OFF porque la API solo
// devuelve JSON; el frontend monta su propio CSP si lo necesita.
// crossOriginResourcePolicy en "cross-origin" para no estorbar al
// frontend en otro dominio (Vercel preview, etc.).
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      const allowedOrigins = parseAllowedOrigins();

      // Requests sin header Origin: tipicamente son herramientas
      // internas (curl, Postman, server-to-server). En desarrollo
      // las dejamos pasar para no estorbar. En produccion las
      // rechazamos porque cualquier cliente no-browser que llegue a
      // la API publica sin Origin probablemente NO es legitimo.
      // Si necesitas tooling interno en prod, exponelo por un
      // endpoint separado o conectalo localhost-only.
      if (!origin) {
        if (process.env.NODE_ENV === "production") {
          callback(new Error("Origen requerido"));
          return;
        }
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin) || isAllowedVercelPreview(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(formatDates(["fecha", "anulada_en"]));
app.use("/api/productos", productoRouter);
app.use("/api/stock", stockRouter);
app.use("/api/auth", authRouter);
app.use("/api/roles", rolRouter);
app.use("/api/usuarios", usuarioRouter);
app.use("/api/ventas", ventaRouter);
app.use("/api/reportes", reporteRouter);
app.use("/api/compras", compraRouter);
app.use("/api/proveedores", proveedorRouter);
app.use("/api/clientes", clienteRouter);
app.use("/api/empleados", empleadoRouter);
app.use("/api/caja", cajaRouter);
app.use("/api/servicios", servicioRouter);
app.use("/api/traslados", trasladoRouter);
app.use("/api/creditos-empleado", creditoEmpleadoRouter);

app.get("/api/health", async (req, res) => {
  const r = await pool.query("SELECT NOW() AS ahora");
  res.json({ ok: true, dbTime: r.rows[0].ahora });
});

// Handler global de errores.
//
// En produccion no se filtran detalles internos al cliente: pueden
// incluir stack traces, SQL, paths internos, etc. Solo se devuelve
// un mensaje generico + un requestId para que el cliente pueda
// reportar el error y el operador buscar el detalle en los logs.
//
// En desarrollo si se devuelve el mensaje original para acelerar
// el ciclo de debug.
//
// NOTA: muchos controllers individuales todavia hacen
// `res.status(500).json({ error: e.message })` directo. Idealmente se
// deberian refactorizar a `next(err)` para que pasen por aqui. Eso
// es deuda pendiente — por ahora este handler solo cubre el path por
// defecto (errores no capturados que se propagan a Express).
app.use((err, req, res, next) => {
  const isProd = process.env.NODE_ENV === "production";
  const requestId =
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // CORS y otros errores tipados pueden traer status custom.
  const status = Number(err.statusCode) || Number(err.status) || 500;

  // Log estructurado: en prod es JSON parseable por SIEM, en dev texto
  // legible. Incluye stack completo para depurar despues.
  logger.error("request_error", {
    request_id: requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    user_id: req.user?.id_usuario ?? null,
    err_name: err.name,
    err_message: err.message,
    err_stack: err.stack,
  });

  if (isProd && status >= 500) {
    return res.status(status).json({
      error: "Error interno del servidor",
      requestId,
    });
  }

  res.status(status).json({
    error: err.message || "Error interno",
    requestId,
  });
});

export default app;
