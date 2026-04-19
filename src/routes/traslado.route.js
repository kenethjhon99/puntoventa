import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  crearTraslado,
  listarTraslados,
  getTraslado,
  anularTraslado,
  listarBodegas,
  stockBodega,
} from "../controllers/traslado.controller.js";

const router = Router();

// Bodegas disponibles (para el selector de origen/destino)
router.get("/bodegas", auth, requireRole("ADMIN", "LECTURA"), listarBodegas);

// Stock disponible en una bodega (para armar el traslado desde origen)
router.get("/bodegas/:id/stock", auth, requireRole("ADMIN", "LECTURA"), stockBodega);

// Crear traslado
router.post("/", auth, requireRole("ADMIN"), crearTraslado);

// Listar traslados (paginado + filtros)
router.get("/", auth, requireRole("ADMIN", "LECTURA"), listarTraslados);

// Detalle traslado
router.get("/:id", auth, requireRole("ADMIN", "LECTURA"), getTraslado);

// Anular traslado (reversa stock)
router.patch("/:id/anular", auth, requireRole("ADMIN"), anularTraslado);

export default router;
