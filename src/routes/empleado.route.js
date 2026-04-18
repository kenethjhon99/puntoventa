import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  activarEmpleado,
  actualizarEmpleado,
  crearEmpleado,
  desactivarEmpleado,
  listarEmpleados,
} from "../controllers/empleado.controller.js";

const router = Router();

router.get("/", auth, requireRole("SUPER_ADMIN", "ADMIN", "LECTURA"), listarEmpleados);
router.post("/", auth, requireRole("SUPER_ADMIN", "ADMIN"), crearEmpleado);
router.put("/:id", auth, requireRole("SUPER_ADMIN", "ADMIN"), actualizarEmpleado);
router.patch("/:id/desactivar", auth, requireRole("SUPER_ADMIN", "ADMIN"), desactivarEmpleado);
router.patch("/:id/activar", auth, requireRole("SUPER_ADMIN", "ADMIN"), activarEmpleado);

export default router;
