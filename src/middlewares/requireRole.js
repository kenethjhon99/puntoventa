// Guard de roles. Si el usuario autenticado no tiene ninguno de los
// roles permitidos, responde 403.
//
// IMPORTANTE: el 403 NO debe filtrar los roles que tiene el usuario
// ni los roles que la ruta requiere. Esa informacion sirve a un
// atacante: con un par de requests puede mapear el sistema de roles
// y descubrir si su token robado corresponde a una cuenta privilegiada.
// El detalle queda solo en logs del servidor.
export const requireRole = (...rolesPermitidos) => {
  const permitidos = rolesPermitidos.map((r) => String(r).toUpperCase());

  return (req, res, next) => {
    const roles = (req.user?.roles || []).map((r) =>
      String(r).trim().toUpperCase()
    );

    const ok = permitidos.some((r) => roles.includes(r));
    if (!ok) {
      console.warn(
        `[requireRole] 403 usuario=${req.user?.username ?? "?"} ` +
          `id=${req.user?.id_usuario ?? "?"} ` +
          `roles=[${roles.join(",")}] ` +
          `permitidos=[${permitidos.join(",")}] ` +
          `ruta=${req.method} ${req.originalUrl}`
      );
      return res.status(403).json({ error: "No autorizado" });
    }
    next();
  };
};
