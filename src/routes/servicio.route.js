import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  actualizarTipoVehiculoReparacion,
  actualizarTipoVehiculoAutolavado,
  actualizarServicioReparacion,
  actualizarServicioAutolavado,
  asignarTecnicoOrdenAutolavado,
  asignarTecnicoOrdenReparacion,
  actualizarEstadoOrdenReparacion,
  actualizarEstadoOrdenAutolavado,
  agregarProductoOrdenReparacion,
  cobrarOrdenReparacion,
  cobrarServicioReparacion,
  cobrarServicioAutolavado,
  crearOrdenReparacion,
  crearServicioReparacion,
  crearServicioAutolavado,
  crearTipoVehiculoReparacion,
  crearTipoVehiculoAutolavado,
  listarCatalogoReparacion,
  listarCatalogoAutolavado,
  listarOrdenesReparacion,
  listarOrdenesAutolavado,
  listarTecnicosAsignables,
} from "../controllers/servicio.controller.js";

const router = Router();

router.get(
  "/tecnicos",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO", "LECTURA"),
  listarTecnicosAsignables
);

router.get(
  "/autolavado/catalogo",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO", "LECTURA"),
  listarCatalogoAutolavado
);
router.post(
  "/autolavado/vehiculos",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  crearTipoVehiculoAutolavado
);
router.put(
  "/autolavado/vehiculos/:id",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  actualizarTipoVehiculoAutolavado
);
router.post(
  "/autolavado/catalogo",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  crearServicioAutolavado
);
router.put(
  "/autolavado/catalogo/:id",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  actualizarServicioAutolavado
);
router.post(
  "/autolavado/cobros",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO"),
  cobrarServicioAutolavado
);
router.get(
  "/autolavado/ordenes",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO", "LECTURA"),
  listarOrdenesAutolavado
);
router.patch(
  "/autolavado/ordenes/:id/estado",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO"),
  actualizarEstadoOrdenAutolavado
);
router.patch(
  "/autolavado/ordenes/:id/tecnico",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO"),
  asignarTecnicoOrdenAutolavado
);
router.get(
  "/reparacion/catalogo",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO", "LECTURA"),
  listarCatalogoReparacion
);
router.post(
  "/reparacion/vehiculos",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  crearTipoVehiculoReparacion
);
router.put(
  "/reparacion/vehiculos/:id",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  actualizarTipoVehiculoReparacion
);
router.post(
  "/reparacion/catalogo",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  crearServicioReparacion
);
router.put(
  "/reparacion/catalogo/:id",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  actualizarServicioReparacion
);
router.post(
  "/reparacion/cobros",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO"),
  cobrarServicioReparacion
);
router.post(
  "/reparacion/ordenes",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO"),
  crearOrdenReparacion
);
router.get(
  "/reparacion/ordenes",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO", "LECTURA"),
  listarOrdenesReparacion
);
router.post(
  "/reparacion/ordenes/:id/cobro",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO"),
  cobrarOrdenReparacion
);
router.post(
  "/reparacion/ordenes/:id/productos",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO"),
  agregarProductoOrdenReparacion
);
router.patch(
  "/reparacion/ordenes/:id/estado",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO"),
  actualizarEstadoOrdenReparacion
);
router.patch(
  "/reparacion/ordenes/:id/tecnico",
  auth,
  requireRole("SUPER_ADMIN", "ADMIN", "CAJERO", "MECANICO"),
  asignarTecnicoOrdenReparacion
);

export default router;
