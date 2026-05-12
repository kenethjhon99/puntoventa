import * as Rol from "../models/rol.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Ejemplo de uso de asyncHandler: el error se delega al handler global
// de app.js, que en produccion devuelve mensaje generico + requestId,
// y en desarrollo el mensaje original. Sin try/catch local.
export const listarRoles = asyncHandler(async (req, res) => {
  const roles = await Rol.getRoles();
  res.json(roles);
});
