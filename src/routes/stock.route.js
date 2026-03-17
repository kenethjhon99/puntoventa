import { Router } from "express";
import { listarStock, ajustarStock, crearMovimiento, listarMovimientos } from "../controllers/stock.controller.js";
import { auth } from "../middlewares/auth.js";

const router = Router();

router.get("/", listarStock);
router.put("/:id_producto",  ajustarStock);
router.post("/movimientos", auth, crearMovimiento);
router.get("/movimientos", auth, listarMovimientos);
export default router;
