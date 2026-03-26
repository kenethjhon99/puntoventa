import { Router } from "express";
import { listarProductos, crearProducto, actualizarProducto, eliminarProducto } from "../controllers/producto.controller.js";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = Router();

router.get("/", auth, listarProductos);
router.post("/", auth, requireRole("SUPER_ADMIN", "ADMIN"), crearProducto);
router.put("/:id", auth, requireRole("SUPER_ADMIN", "ADMIN"), actualizarProducto);
router.patch("/:id/desactivar", auth, requireRole("SUPER_ADMIN", "ADMIN"), eliminarProducto);
router.delete("/:id", auth, requireRole("SUPER_ADMIN", "ADMIN"), eliminarProducto);
export default router;
