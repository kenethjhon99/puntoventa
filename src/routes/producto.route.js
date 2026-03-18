import { Router } from "express";
import { listarProductos, crearProducto, actualizarProducto, eliminarProducto } from "../controllers/producto.controller.js";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = Router();

router.get("/", auth, requireRole("ADMIN", "CAJERO"), listarProductos);
router.post("/", auth, requireRole("ADMIN"), crearProducto);
router.put("/:id", auth, requireRole("ADMIN"), actualizarProducto);
router.patch("/:id/desactivar", auth, requireRole("ADMIN"), eliminarProducto);
router.delete("/:id", auth, requireRole("ADMIN"), eliminarProducto);
export default router;
