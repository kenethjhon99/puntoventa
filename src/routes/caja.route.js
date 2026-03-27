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
  validarMovimientoPendiente,
  validarNoCobroPendiente,
} from "../controllers/caja.controller.js";

const router = Router();

router.get("/sesion-activa", auth, requireRole("ADMIN", "CAJERO", "MECANICO", "LECTURA"), getSesionActiva);
router.get("/sesiones", auth, requireRole("ADMIN", "CAJERO", "MECANICO", "LECTURA"), listarSesiones);
router.get("/:id_sesion/resumen", auth, requireRole("ADMIN", "CAJERO", "MECANICO", "LECTURA"), getResumenCaja);
router.post("/apertura", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), abrirCaja);
router.post("/:id_sesion/movimientos", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), registrarMovimiento);
router.post("/:id_sesion/pendientes/no-cobro/validar", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), validarNoCobroPendiente);
router.post("/:id_sesion/pendientes/movimientos/:id_movimiento/validar", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), validarMovimientoPendiente);
router.post("/:id_sesion/cierre", auth, requireRole("ADMIN", "CAJERO", "MECANICO"), cerrarCaja);

export default router;
