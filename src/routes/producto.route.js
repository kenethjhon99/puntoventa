import { Router } from "express";
import { listarProductos, crearProducto, actualizarProducto, eliminarProducto } from "../controllers/producto.controller.js";
import { auth } from "../middlewares/auth.js";

const router = Router();

router.get("/", listarProductos);
router.post("/", auth, crearProducto);
router.put("/:id", auth, actualizarProducto);
router.delete("/:id", auth, eliminarProducto);
export default router;
