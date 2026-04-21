import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  listarTraslados,
  getTraslado,
} from "../controllers/traslado.controller.js";

const router = Router();

// --------------------------------------------------------------------
// Traslados: solo lectura desde Fase 4b.2 (Ruta A).
//
// A partir de la consolidacion de stock a una sola bodega PRINCIPAL,
// los traslados entre bodegas perdieron sentido funcional. Los
// endpoints de creacion, anulacion y exploracion de stock por bodega
// fueron retirados. Los listados y detalle siguen disponibles para
// consulta historica.
// --------------------------------------------------------------------

const trasladoDeprecated = (_req, res) =>
  res.status(410).json({
    error:
      "Los traslados entre bodegas fueron retirados tras la consolidacion de stock a una bodega unica (PRINCIPAL).",
  });

// Listar traslados (paginado + filtros) - historico
router.get("/", auth, requireRole("ADMIN", "LECTURA"), listarTraslados);

// Detalle traslado - historico
router.get("/:id", auth, requireRole("ADMIN", "LECTURA"), getTraslado);

// Endpoints deprecados (410 Gone).
router.post("/", auth, trasladoDeprecated);
router.patch("/:id/anular", auth, trasladoDeprecated);
router.get("/bodegas", auth, trasladoDeprecated);
router.get("/bodegas/:id/stock", auth, trasladoDeprecated);

export default router;
