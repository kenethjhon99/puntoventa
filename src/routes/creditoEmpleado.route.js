import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  listarCreditos,
  getCredito,
  getAlertas,
  getNominaProxima,
  cobrarCredito,
  condonarCredito,
} from "../controllers/creditoEmpleado.controller.js";

const router = Router();

// Alertas para dashboard/sidebar
router.get("/alertas", auth, requireRole("SUPER_ADMIN", "ADMIN", "LECTURA"), getAlertas);

// Proximo corte estimado de creditos por empleado
router.get("/nomina-proxima", auth, requireRole("SUPER_ADMIN", "ADMIN", "LECTURA"), getNominaProxima);

// Listar creditos con filtros (estado, id_empleado, desde, hasta, criticidad)
router.get("/", auth, requireRole("SUPER_ADMIN", "ADMIN", "LECTURA"), listarCreditos);

// Detalle
router.get("/:id", auth, requireRole("SUPER_ADMIN", "ADMIN", "LECTURA"), getCredito);

// Cobrar credito (solo ADMIN)
router.patch("/:id/cobrar", auth, requireRole("SUPER_ADMIN", "ADMIN"), cobrarCredito);

// Condonar credito (solo ADMIN, motivo obligatorio)
router.patch("/:id/condonar", auth, requireRole("SUPER_ADMIN", "ADMIN"), condonarCredito);

export default router;
