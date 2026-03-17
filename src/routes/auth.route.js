import { Router } from "express";
import { register, login } from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);

export default router;
/* modificar base de datos para los estados de auditoria y comenzar modulo de ventas  Te falta para auditoría:

✅ estado
✅ id_usuario (quién hizo la venta)
✅ anulada_en, anulada_por, motivo_anulacion (opcional pero buenísimo)
*/
