import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { corteVentas, corteVentasDetallado, corteVentasDetalladoPro } from "../controllers/reporte.controller.js";

const router = Router();

router.get("/corte", auth, requireRole("ADMIN"), corteVentas);
router.get("/corte-detallado", auth, requireRole("ADMIN"), corteVentasDetallado);
router.get("/corte-detallado-pro", auth, requireRole("ADMIN"), corteVentasDetalladoPro);
    
export default router;