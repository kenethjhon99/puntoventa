import "dotenv/config";
import { validateEnv } from "./config/validateEnv.js";

// IMPORTANTE: validateEnv() corre ANTES de importar app/db. Si la
// configuracion esta rota o insegura, abortamos sin abrir conexiones.
validateEnv();

const { default: app } = await import("./app.js");
const { testDB } = await import("./config/db.js");

await testDB();

app.listen(process.env.PORT || 3000, () =>
  console.log("🚀 Servidor en puerto", process.env.PORT || 3000)
);
