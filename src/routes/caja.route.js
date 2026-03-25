import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  abrirCaja,
  cerrarCaja,
  getResumenCaja,
  getSesionActiva,
  listarSesiones,
  registrarMovimiento,
} from "../controllers/caja.controller.js";

const router = Router();

router.get("/sesion-activa", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), getSesionActiva);
router.get("/sesiones", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), listarSesiones);
router.get("/:id_sesion/resumen", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), getResumenCaja);
router.post("/apertura", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), abrirCaja);
router.post("/:id_sesion/movimientos", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), registrarMovimiento);
router.post("/:id_sesion/cierre", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), cerrarCaja);

export default router;
