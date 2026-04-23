import { pool } from "../config/db.js";
import {
  BODEGA_GENERAL,
  BODEGA_GENERAL_VISIBLE,
  BODEGA_TIENDA_TALLER,
  BODEGA_TIENDA_TALLER_VISIBLE,
  normalizeBodegaKey,
} from "../constants/inventory.js";

const resolveExecutor = (executor) => executor || pool;

export const getBodegaLogicaByKey = async (key, executor = null) => {
  const db = resolveExecutor(executor);
  const normalizedKey = normalizeBodegaKey(key);
  const result = await db.query(
    `
      SELECT
        b.id_bodega,
        UPPER(TRIM(b."Nombre")) AS nombre_bodega,
        CASE
          WHEN UPPER(TRIM(b."Nombre")) = $1 THEN $3
          ELSE $4
        END AS nombre_visible
      FROM "Bodega" b
      WHERE UPPER(TRIM(b."Nombre")) IN ($1, $2)
        AND UPPER(TRIM(b."Nombre")) = $5
      ORDER BY b.id_bodega ASC
      LIMIT 1
    `,
    [
      BODEGA_GENERAL,
      BODEGA_TIENDA_TALLER,
      BODEGA_GENERAL_VISIBLE,
      BODEGA_TIENDA_TALLER_VISIBLE,
      normalizedKey,
    ]
  );

  return result.rows[0] || null;
};

export const requireBodegaLogicaByKey = async (key, executor = null) => {
  const bodega = await getBodegaLogicaByKey(key, executor);
  if (!bodega) {
    throw new Error(`No se encontro la bodega logica ${normalizeBodegaKey(key)}`);
  }
  return bodega;
};

export const getBodegasLogicas = async (executor = null) => {
  const db = resolveExecutor(executor);
  const result = await db.query(
    `
      SELECT
        b.id_bodega,
        UPPER(TRIM(b."Nombre")) AS nombre_bodega,
        CASE
          WHEN UPPER(TRIM(b."Nombre")) = $1 THEN $3
          ELSE $4
        END AS nombre_visible
      FROM "Bodega" b
      WHERE UPPER(TRIM(b."Nombre")) IN ($1, $2)
      ORDER BY
        CASE
          WHEN UPPER(TRIM(b."Nombre")) = $1 THEN 1
          ELSE 2
        END,
        b.id_bodega ASC
    `,
    [
      BODEGA_GENERAL,
      BODEGA_TIENDA_TALLER,
      BODEGA_GENERAL_VISIBLE,
      BODEGA_TIENDA_TALLER_VISIBLE,
    ]
  );

  return result.rows;
};
