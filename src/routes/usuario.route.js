import { Router } from "express";
import {
  listarUsuarios,
  editarUsuario,
  desactivarUsuario,
  activarUsuario,
  asignarRol,
  quitarRol,
} from "../controllers/usuario.controller.js";

import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = Router();

// (Por ahora solo protegido con auth. Luego metemos role=ADMIN)
router.get("/", auth, requireRole("ADMIN"), listarUsuarios);
router.post("/:id", auth, requireRole("ADMIN"), editarUsuario);

// soft delete
router.post("/:id/desactivar", auth, requireRole("ADMIN"), desactivarUsuario);
router.post("/:id/activar", auth, requireRole("ADMIN"), activarUsuario);

// roles
router.post("/:id/roles", auth, requireRole("ADMIN"), asignarRol);
router.delete("/:id/roles/:id_rol", auth, requireRole("ADMIN"), quitarRol);



export default router;
