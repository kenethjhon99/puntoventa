import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  crearTraslado,
  getTraslado,
  listarBodegasTraslado,
  listarProductosBodegaOrigen,
  listarTraslados,
} from "../controllers/traslado.controller.js";

const router = Router();

router.get(
  "/",
  auth,
  requireRole("ADMIN", "LECTURA", "ENCARGADO_SERVICIOS"),
  listarTraslados
);

router.get(
  "/bodegas",
  auth,
  requireRole("ADMIN", "LECTURA", "ENCARGADO_SERVICIOS"),
  listarBodegasTraslado
);

router.get(
  "/bodegas/:id/stock",
  auth,
  requireRole("ADMIN", "LECTURA", "ENCARGADO_SERVICIOS"),
  listarProductosBodegaOrigen
);

router.post(
  "/",
  auth,
  requireRole("ADMIN", "ENCARGADO_SERVICIOS"),
  crearTraslado
);

router.get(
  "/:id",
  auth,
  requireRole("ADMIN", "LECTURA", "ENCARGADO_SERVICIOS"),
  getTraslado
);

export default router;
