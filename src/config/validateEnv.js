// ---------------------------------------------------------------------
// Validacion de configuracion de entorno al arrancar (fail-fast).
//
// Se ejecuta antes de levantar el servidor. Si alguna variable critica
// esta vacia o claramente insegura, abortamos con un mensaje claro.
// Esto previene que el sistema arranque en estados peligrosos como:
//
//   - JWT_SECRET vacio  -> jsonwebtoken usa undefined y los tokens
//                          no se pueden verificar.
//   - JWT_SECRET = "pon_una_clave_larga_y_segura_aqui"
//                        -> el placeholder del README; un atacante que
//                           conozca el repo puede falsificar tokens.
//   - PGPASSWORD vacio  -> el server arranca pero falla en cada query.
//
// En produccion (`NODE_ENV=production`) las validaciones son mas
// estrictas (no acepta passwords debiles conocidos, JWT_SECRET corto).
// En desarrollo, solo emite warnings para no estorbar al iniciar
// localmente.
// ---------------------------------------------------------------------

const KNOWN_WEAK_JWT_SECRETS = new Set([
  "pon_una_clave_larga_y_segura_aqui",
  "genera_un_secret_aleatorio_de_32_bytes_o_mas",
  "secret",
  "supersecret",
  "changeme",
  "default",
  "jwt_secret",
  "your-secret-key",
]);

const KNOWN_WEAK_DB_PASSWORDS = new Set([
  "1234",
  "12345",
  "123456",
  "password",
  "postgres",
  "admin",
  "root",
  "cambia_este_password",
]);

const MIN_JWT_SECRET_LENGTH = 32;

const fail = (msg) => {
  console.error("\n[validateEnv] FATAL:", msg, "\n");
  process.exit(1);
};

const warn = (msg) => {
  console.warn("[validateEnv] WARN:", msg);
};

export const validateEnv = () => {
  const isProd = process.env.NODE_ENV === "production";

  // ---- JWT_SECRET ----
  const jwtSecret = String(process.env.JWT_SECRET || "");
  if (!jwtSecret) {
    fail("JWT_SECRET no esta definido. El servidor no puede firmar tokens.");
  }
  if (KNOWN_WEAK_JWT_SECRETS.has(jwtSecret)) {
    fail(
      "JWT_SECRET es un placeholder/valor conocido. Genera uno con:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
    );
  }
  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    const msg = `JWT_SECRET demasiado corto (${jwtSecret.length} chars). Minimo recomendado: ${MIN_JWT_SECRET_LENGTH}.`;
    if (isProd) fail(msg);
    else warn(msg);
  }

  // ---- DB password ----
  const dbPassword = String(process.env.PGPASSWORD || "");
  if (!dbPassword) {
    fail("PGPASSWORD no esta definido.");
  }
  if (KNOWN_WEAK_DB_PASSWORDS.has(dbPassword)) {
    const msg = `PGPASSWORD es un valor debil conocido ("${dbPassword}"). Cambialo en Postgres con: ALTER USER postgres WITH PASSWORD '...'`;
    if (isProd) fail(msg);
    else warn(msg);
  }

  // ---- Otros bits informativos ----
  if (isProd && process.env.CORS_ALLOW_VERCEL_PREVIEWS === "true") {
    warn(
      "CORS_ALLOW_VERCEL_PREVIEWS=true en produccion permite previews de Vercel. Confirma que es intencional."
    );
  }

  console.log("[validateEnv] OK");
};
