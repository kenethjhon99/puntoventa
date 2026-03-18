import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: false,
});

const AUDIT_TABLES = [
  "Producto",
  "Proveedor",
  "Clientes",
  "Usuario",
  "Persona",
  "Compra",
  "Detalle_compra",
  "Venta",
  "Detalle_venta",
  "Stock_producto",
  "Movimiento_stock",
  "Rol",
  "Detalle_usuario",
];

const SOFT_DELETE_TABLES = [
  { tableName: "Producto", activeColumn: "activo" },
  { tableName: "Proveedor", activeColumn: "estado" },
  { tableName: "Clientes", activeColumn: "estado" },
  { tableName: "Usuario", activeColumn: "activo" },
  { tableName: "Persona", activeColumn: "estado" },
  { tableName: "Detalle_usuario", activeColumn: "activo" },
];

const sanitizeTriggerName = (tableName) =>
  `trg_${String(tableName).toLowerCase().replace(/[^a-z0-9]+/g, "_")}_updated_at`;

const ensureAuditColumnsForTable = async (tableName) => {
  await pool.query(`
    ALTER TABLE "${tableName}"
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now()
  `);

  await pool.query(`
    ALTER TABLE "${tableName}"
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now()
  `);

  await pool.query(`
    ALTER TABLE "${tableName}"
    ADD COLUMN IF NOT EXISTS created_by integer
  `);

  await pool.query(`
    ALTER TABLE "${tableName}"
    ADD COLUMN IF NOT EXISTS updated_by integer
  `);

  await pool.query(`
    UPDATE "${tableName}"
    SET created_at = COALESCE(created_at, now()),
        updated_at = COALESCE(updated_at, now())
    WHERE created_at IS NULL OR updated_at IS NULL
  `);
};

const ensureSoftDeleteColumnsForTable = async (tableName, activeColumn) => {
  await pool.query(`
    ALTER TABLE "${tableName}"
    ADD COLUMN IF NOT EXISTS "${activeColumn}" boolean NOT NULL DEFAULT true
  `);

  await pool.query(`
    ALTER TABLE "${tableName}"
    ADD COLUMN IF NOT EXISTS inactivado_en timestamp with time zone
  `);

  await pool.query(`
    ALTER TABLE "${tableName}"
    ADD COLUMN IF NOT EXISTS inactivado_por integer
  `);
};

const ensureUpdatedAtTriggerForTable = async (tableName) => {
  const triggerName = sanitizeTriggerName(tableName);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = '${triggerName}'
      ) THEN
        EXECUTE 'CREATE TRIGGER ${triggerName}
        BEFORE UPDATE ON "${tableName}"
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at_column()';
      END IF;
    END $$;
  `);
};

export async function ensureSchema() {
  await pool.query(`
    CREATE OR REPLACE FUNCTION set_updated_at_column()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  for (const tableName of AUDIT_TABLES) {
    await ensureAuditColumnsForTable(tableName);
  }

  for (const table of SOFT_DELETE_TABLES) {
    await ensureSoftDeleteColumnsForTable(table.tableName, table.activeColumn);
  }

  for (const tableName of AUDIT_TABLES) {
    await ensureUpdatedAtTriggerForTable(tableName);
  }

  await pool.query(`
    ALTER TABLE "Clientes"
    ADD COLUMN IF NOT EXISTS nombre character varying(150)
  `);

  await pool.query(`
    ALTER TABLE "Clientes"
    ADD COLUMN IF NOT EXISTS telefono character varying(30)
  `);

  await pool.query(`
    ALTER TABLE "Clientes"
    ADD COLUMN IF NOT EXISTS correo character varying(150)
  `);

  await pool.query(`
    ALTER TABLE "Clientes"
    ADD COLUMN IF NOT EXISTS direccion character varying(250)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "clientes_nit_unique"
    ON "Clientes" (nit)
    WHERE nit IS NOT NULL
  `);

  await pool.query(`
    ALTER TABLE "Venta"
    ADD COLUMN IF NOT EXISTS id_cliente integer
  `);

  await pool.query(`
    ALTER TABLE "Compra"
    ADD COLUMN IF NOT EXISTS anulada_en timestamp with time zone
  `);

  await pool.query(`
    ALTER TABLE "Compra"
    ADD COLUMN IF NOT EXISTS anulada_por integer
  `);

  await pool.query(`
    ALTER TABLE "Compra"
    ADD COLUMN IF NOT EXISTS motivo_anulacion text
  `);

  await pool.query(`
    ALTER TABLE "Detalle_compra"
    ADD COLUMN IF NOT EXISTS cantidad_anulada integer NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE "Detalle_compra"
    ADD COLUMN IF NOT EXISTS anulada_en timestamp with time zone
  `);

  await pool.query(`
    ALTER TABLE "Detalle_compra"
    ADD COLUMN IF NOT EXISTS anulada_por integer
  `);

  await pool.query(`
    ALTER TABLE "Detalle_compra"
    ADD COLUMN IF NOT EXISTS motivo_anulacion text
  `);

  await pool.query(`
    ALTER TABLE "Detalle_compra"
    ADD COLUMN IF NOT EXISTS estado character varying(20) NOT NULL DEFAULT 'ACTIVO'
  `);

  await pool.query(`
    ALTER TABLE "Detalle_venta"
    ADD COLUMN IF NOT EXISTS cantidad_anulada integer NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE "Detalle_venta"
    ADD COLUMN IF NOT EXISTS anulada_en timestamp with time zone
  `);

  await pool.query(`
    ALTER TABLE "Detalle_venta"
    ADD COLUMN IF NOT EXISTS anulada_por integer
  `);

  await pool.query(`
    ALTER TABLE "Detalle_venta"
    ADD COLUMN IF NOT EXISTS motivo_anulacion text
  `);

  await pool.query(`
    ALTER TABLE "Detalle_venta"
    ADD COLUMN IF NOT EXISTS estado character varying(20) NOT NULL DEFAULT 'ACTIVO'
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'Venta'
          AND constraint_name = 'fk_venta_cliente'
      ) THEN
        ALTER TABLE "Venta"
        ADD CONSTRAINT fk_venta_cliente
        FOREIGN KEY (id_cliente) REFERENCES "Clientes"("Id_clientes");
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_venta_cliente"
    ON "Venta" (id_cliente)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Detalle_venta_anulacion" (
      id_anulacion serial PRIMARY KEY,
      id_venta integer NOT NULL REFERENCES "Venta"(id_venta),
      id_detalle integer NOT NULL REFERENCES "Detalle_venta"(id_detalle),
      id_producto integer REFERENCES "Producto"(id_producto),
      cantidad integer NOT NULL,
      motivo text,
      fecha timestamp with time zone NOT NULL DEFAULT now(),
      id_usuario integer REFERENCES "Usuario"(id_usuario)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_detalle_venta_anulacion_venta"
    ON "Detalle_venta_anulacion" (id_venta)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_detalle_venta_anulacion_detalle"
    ON "Detalle_venta_anulacion" (id_detalle)
  `);

  await ensureAuditColumnsForTable("Detalle_venta_anulacion");
  await ensureUpdatedAtTriggerForTable("Detalle_venta_anulacion");

  await pool.query(`
    UPDATE "Detalle_venta_anulacion"
    SET created_at = COALESCE(created_at, fecha),
        updated_at = COALESCE(updated_at, fecha),
        created_by = COALESCE(created_by, id_usuario),
        updated_by = COALESCE(updated_by, id_usuario)
    WHERE created_at IS NULL
       OR updated_at IS NULL
       OR created_by IS NULL
       OR updated_by IS NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Detalle_compra_anulacion" (
      id_anulacion serial PRIMARY KEY,
      id_compra integer NOT NULL REFERENCES "Compra"(id_compra),
      id_detalle_compra integer NOT NULL REFERENCES "Detalle_compra"(id_detalle_compra),
      id_producto integer REFERENCES "Producto"(id_producto),
      cantidad integer NOT NULL,
      motivo text,
      fecha timestamp with time zone NOT NULL DEFAULT now(),
      id_usuario integer REFERENCES "Usuario"(id_usuario)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_detalle_compra_anulacion_compra"
    ON "Detalle_compra_anulacion" (id_compra)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_detalle_compra_anulacion_detalle"
    ON "Detalle_compra_anulacion" (id_detalle_compra)
  `);

  await ensureAuditColumnsForTable("Detalle_compra_anulacion");
  await ensureUpdatedAtTriggerForTable("Detalle_compra_anulacion");

  await pool.query(`
    UPDATE "Detalle_compra_anulacion"
    SET created_at = COALESCE(created_at, fecha),
        updated_at = COALESCE(updated_at, fecha),
        created_by = COALESCE(created_by, id_usuario),
        updated_by = COALESCE(updated_by, id_usuario)
    WHERE created_at IS NULL
       OR updated_at IS NULL
       OR created_by IS NULL
       OR updated_by IS NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Caja_sesion" (
      id_caja_sesion serial PRIMARY KEY,
      id_usuario integer NOT NULL REFERENCES "Usuario"(id_usuario),
      id_sucursal integer NOT NULL DEFAULT 1,
      estado character varying(20) NOT NULL DEFAULT 'ABIERTA',
      monto_apertura numeric(12,2) NOT NULL DEFAULT 0,
      monto_cierre_reportado numeric(12,2),
      monto_cierre_calculado numeric(12,2),
      diferencia numeric(12,2),
      observaciones_apertura text,
      observaciones_cierre text,
      fecha_apertura timestamp with time zone NOT NULL DEFAULT now(),
      fecha_cierre timestamp with time zone
    )
  `);

  await ensureAuditColumnsForTable("Caja_sesion");
  await ensureUpdatedAtTriggerForTable("Caja_sesion");

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "uq_caja_sesion_abierta_usuario"
    ON "Caja_sesion" (id_usuario)
    WHERE estado = 'ABIERTA'
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_caja_sesion_usuario_fecha"
    ON "Caja_sesion" (id_usuario, fecha_apertura DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Caja_movimiento" (
      id_caja_movimiento serial PRIMARY KEY,
      id_caja_sesion integer NOT NULL REFERENCES "Caja_sesion"(id_caja_sesion),
      id_usuario integer NOT NULL REFERENCES "Usuario"(id_usuario),
      tipo character varying(20) NOT NULL,
      categoria character varying(50),
      monto numeric(12,2) NOT NULL,
      descripcion text,
      fecha timestamp with time zone NOT NULL DEFAULT now()
    )
  `);

  await ensureAuditColumnsForTable("Caja_movimiento");
  await ensureUpdatedAtTriggerForTable("Caja_movimiento");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "idx_caja_movimiento_sesion_fecha"
    ON "Caja_movimiento" (id_caja_sesion, fecha DESC)
  `);

  await pool.query(`
    INSERT INTO "Rol" (nombre_rol)
    SELECT 'SUPER_ADMIN'
    WHERE NOT EXISTS (
      SELECT 1
      FROM "Rol"
      WHERE UPPER(TRIM(nombre_rol)) = 'SUPER_ADMIN'
    )
  `);

  await pool.query(`
    ALTER TABLE "Persona"
    ALTER COLUMN fecha_inicio SET DEFAULT CURRENT_DATE
  `);
}

export async function testDB() {
  await ensureSchema();
  const r = await pool.query("SELECT NOW() AS ahora");
  console.log("Postgres conectado:", r.rows[0].ahora);
}
