import { Router } from "express";
import {
  listarProductos,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  generarCodigoBarrasProducto,
} from "../controllers/producto.controller.js";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = Router();

// Listado de productos: lo consumen casi todos los modulos operativos
// (ventas, servicios, inventario). Lista explicita de roles para que
// si en el futuro se crea un rol nuevo no tenga acceso automatico.
router.get(
  "/",
  auth,
  requireRole(
    "SUPER_ADMIN",
    "ADMIN",
    "CAJERO",
    "MECANICO",
    "ENCARGADO_SERVICIOS",
    "LECTURA"
  ),
  listarProductos
);
router.get(
  "/codigo-barras/generar",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "ENCARGADO_SERVICIOS"),
  generarCodigoBarrasProducto
);
router.post("/", auth, requireRole("SUPER_ADMIN", "ADMIN", "ENCARGADO_SERVICIOS"), crearProducto);
router.put("/:id", auth, requireRole("SUPER_ADMIN", "ADMIN", "ENCARGADO_SERVICIOS"), actualizarProducto);
router.patch("/:id/desactivar", auth, requireRole("SUPER_ADMIN", "ADMIN", "ENCARGADO_SERVICIOS"), eliminarProducto);
router.delete("/:id", auth, requireRole("SUPER_ADMIN", "ADMIN", "ENCARGADO_SERVICIOS"), eliminarProducto);
export default router;
