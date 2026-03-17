import * as U from "../models/usuario.admin.model.js";

export const listarUsuarios = async (req, res) => {
  try {
    const data = await U.listarUsuarios();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const editarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: "id inválido" });

    const { username, nombre, persona } = req.body;

    // 1) Update usuario (si viene)
    const u = await U.actualizarUsuarioBasico(Number(id), {
      username: username ? String(username).trim() : null,
      nombre: nombre ? String(nombre).trim() : null,
    });

    if (!u) return res.status(404).json({ error: "Usuario no encontrado" });

    // 2) Update persona (si viene)
    let p = null;
    if (persona && typeof persona === "object") {
      // solo permitimos campos conocidos (seguro)
      const allowed = [
        "dpi_persona",
        "nombre",
        "apellido",
        "fecha_nacimiento",
        "direccion_persona",
        "telefono",
        "estado",
      ];
      const data = {};
      for (const k of allowed) {
        if (persona[k] !== undefined) data[k] = persona[k];
      }
      p = await U.actualizarPersona(Number(id), data);
    }

    res.json({ ok: true, usuario: u, persona: p });
  } catch (e) {
    // username unique -> 23505
    if (e.code === "23505") return res.status(409).json({ error: "username ya existe" });
    res.status(500).json({ error: e.message });
  }
};

export const desactivarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: "id inválido" });

    const r = await U.setActivoUsuario(Number(id), false);
    if (!r) return res.status(404).json({ error: "Usuario no encontrado" });

    res.json({ ok: true, usuario: r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const activarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) return res.status(400).json({ error: "id inválido" });

    const r = await U.setActivoUsuario(Number(id), true);
    if (!r) return res.status(404).json({ error: "Usuario no encontrado" });

    res.json({ ok: true, usuario: r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const asignarRol = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_rol } = req.body;

    if (!/^\d+$/.test(id)) return res.status(400).json({ error: "id inválido" });
    if (!/^\d+$/.test(String(id_rol))) return res.status(400).json({ error: "id_rol inválido" });

    const u = await U.getUsuarioById(Number(id));
    if (!u) return res.status(404).json({ error: "Usuario no encontrado" });

    const r = await U.asignarRol(Number(id), Number(id_rol));
    // si ya existía, r será undefined
    res.json({ ok: true, asignado: !!r, detalle: r ?? null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const quitarRol = async (req, res) => {
  try {
    const { id, id_rol } = req.params;

    if (!/^\d+$/.test(id)) return res.status(400).json({ error: "id inválido" });
    if (!/^\d+$/.test(id_rol)) return res.status(400).json({ error: "id_rol inválido" });

    const r = await U.quitarRol(Number(id), Number(id_rol));
    if (!r) return res.status(404).json({ error: "Ese rol no estaba asignado" });

    res.json({ ok: true, detalle: r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
