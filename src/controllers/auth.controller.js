import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import * as Usuario from "../models/usuario.model.js";
import { pool } from "../config/db.js";
import * as Auth from "../models/auth.model.js";

const signToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || "8h",
  });
};

export const register = async (req, res) => {
  const client = await pool.connect();

  try {
    const { username, password, roles = [], persona } = req.body;

    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "username requerido" });
    }
    if (!password || typeof password !== "string" || password.length < 4) {
      return res.status(400).json({ error: "password requerido (mínimo 4)" });
    }
    if (!persona || typeof persona !== "object") {
      return res.status(400).json({ error: "persona es requerida" });
    }
    if (!persona.nombre || !persona.apellido) {
      return res.status(400).json({ error: "persona.nombre y persona.apellido son requeridos" });
    }

    await client.query("BEGIN");

    // 1) Verificar username único
    const ex = await client.query(`SELECT 1 FROM "Usuario" WHERE username = $1 LIMIT 1`, [username.trim()]);
    if (ex.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "username ya existe" });
    }

    // 2) Crear usuario con hash
    const password_hash = await bcrypt.hash(password, 10);

    const rUser = await client.query(
      `INSERT INTO "Usuario" (username, password_hash, nombre, activo)
       VALUES ($1,$2,$3,true)
       RETURNING id_usuario, username, nombre, activo`,
      [username.trim(), password_hash, `${persona.nombre} ${persona.apellido}`.trim()]
    );

    const id_usuario = rUser.rows[0].id_usuario;

    // 3) Crear persona
    const rPersona = await client.query(
      `INSERT INTO "Persona"
       (dpi_persona, nombre, apellido, fecha_nacimiento, fecha_inicio, direccion_persona, telefono, estado, id_usuario)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        persona.dpi_persona ?? null,
        persona.nombre.trim(),
        persona.apellido.trim(),
        persona.fecha_nacimiento ?? null,
        persona.fecha_inicio ?? null,
        persona.direccion_persona ?? null,
        persona.telefono ?? null,
        persona.estado ?? true,
        id_usuario
      ]
    );

    // 4) Asignar roles (si vienen)
    if (Array.isArray(roles)) {
      for (const id_rol of roles) {
        if (!Number.isInteger(Number(id_rol))) continue;

        await client.query(
          `INSERT INTO "Detalle_usuario" (id_usuario, id_rol)
           VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [id_usuario, Number(id_rol)]
        );
      }
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      usuario: rUser.rows[0],
      persona: rPersona.rows[0],
      roles_asignados: roles
    });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const login = async (req, res) => {
  try {
    
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "username y password son requeridos" });
    }

    const user = await Auth.getUsuarioByUsername(username.trim());
    if (!user) return res.status(401).json({ error: "Credenciales incorrectas" });
    if (!user.activo) return res.status(403).json({ error: "Usuario inactivo" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales incorrectas" });

    const roles = await Auth.getRolesByUsuario(user.id_usuario);

    const token = jwt.sign(
      {
        id_usuario: user.id_usuario,
        username: user.username,
        roles: roles.map(r => String(r.nombre_rol).trim().toUpperCase()), // ["ADMIN","CAJERO"]
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || "8h" }
    );

    return res.json({
      ok: true,
      token,
      user: {
        id_usuario: user.id_usuario,
        username: user.username,
        nombre: user.nombre,
        roles,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};