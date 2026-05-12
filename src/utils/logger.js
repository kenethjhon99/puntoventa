// ---------------------------------------------------------------------
// Logger centralizado.
//
// En produccion (`NODE_ENV=production`) emite cada evento como una
// linea JSON. Eso permite que agregadores tipo CloudWatch, Datadog,
// Loki, etc., parseen los campos sin regex fragiles.
//
// En desarrollo emite texto humano-legible para no estorbar al dev
// que mira la consola.
// ---------------------------------------------------------------------

const isProd = process.env.NODE_ENV === "production";

const SERVICE = "pos-backend";

// Truncar strings largos para no llenar los logs.
const truncate = (value, max = 200) => {
  if (value == null) return value;
  const s = String(value);
  return s.length <= max ? s : s.slice(0, max) + "...";
};

const baseFields = (level, event, fields = {}) => ({
  ts: new Date().toISOString(),
  level,
  service: SERVICE,
  event,
  ...fields,
});

const writeJson = (level, event, fields) => {
  const out = baseFields(level, event, fields);
  // process.stdout.write evita problemas de buffering vs console.*.
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(out) + "\n");
};

const writeText = (level, event, fields) => {
  const tag = level.toUpperCase().padEnd(5);
  const parts = [tag, event];
  for (const [k, v] of Object.entries(fields || {})) {
    if (v == null) continue;
    parts.push(`${k}=${typeof v === "string" ? JSON.stringify(v) : v}`);
  }
  const line = parts.join(" ");
  if (level === "error" || level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
};

const write = (level, event, fields = {}) => {
  // Truncacion defensiva en user_agent y otros campos libres.
  const safe = {};
  for (const [k, v] of Object.entries(fields)) {
    safe[k] = typeof v === "string" ? truncate(v) : v;
  }
  if (isProd) writeJson(level, event, safe);
  else writeText(level, event, safe);
};

export const logger = {
  info: (event, fields) => write("info", event, fields),
  warn: (event, fields) => write("warn", event, fields),
  error: (event, fields) => write("error", event, fields),
};
