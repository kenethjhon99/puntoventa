import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { crearVenta, anularDetalleVenta, getVenta, listarVentas, getVentaCompleta } from "../controllers/venta.controller.js";

const router = Router();

// Crear venta
router.post("/", auth, requireRole("ADMIN", "CAJERO"), crearVenta);

// Anulación parcial de detalle
router.post(
  "/:id_venta/detalles/:id_detalle/anular",
  auth,
  requireRole("ADMIN", "CAJERO"),
  anularDetalleVenta
);

// Obtener venta por ID
router.get("/:id", auth, requireRole("ADMIN", "CAJERO"), getVenta);

// Listar ventas
router.get("/", auth, requireRole("ADMIN", "CAJERO"), listarVentas);
  
// Obtener venta completa
router.get("/:id/completa", auth, requireRole("ADMIN", "CAJERO"), getVentaCompleta);

export default router;
