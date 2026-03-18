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

router.get("/sesion-activa", auth, requireRole("ADMIN", "CAJERO"), getSesionActiva);
router.get("/sesiones", auth, requireRole("ADMIN", "CAJERO"), listarSesiones);
router.get("/:id_sesion/resumen", auth, requireRole("ADMIN", "CAJERO"), getResumenCaja);
router.post("/apertura", auth, requireRole("ADMIN", "CAJERO"), abrirCaja);
router.post("/:id_sesion/movimientos", auth, requireRole("ADMIN", "CAJERO"), registrarMovimiento);
router.post("/:id_sesion/cierre", auth, requireRole("ADMIN", "CAJERO"), cerrarCaja);

export default router;
