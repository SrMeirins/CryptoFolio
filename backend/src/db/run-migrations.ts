/**
 * Runner de migraciones para modo standalone / Electron.
 * En Docker el schema lo aplica el entrypoint de PostgreSQL.
 * Aquí lo hacemos nosotros.
 */
import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import { pool } from './client';

/** Busca el directorio db/ tanto en dev (src/db) como en prod (extraResources/backend/src/db) */
function resolveDbDir(): string {
  // En Electron, los recursos están en process.resourcesPath
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (process.env.ELECTRON_MODE === 'true' && resourcesPath) {
    const electronPath = path.join(resourcesPath, 'backend', 'src', 'db');
    if (fs.existsSync(electronPath)) return electronPath;
  }
  // En desarrollo (ts-node-dev, __dirname = src/db) / build local (__dirname =
  // dist/db, con schema.sql y migrations/ copiados ahí por `npm run build`,
  // ver "copy-db-assets" en package.json)
  return path.join(__dirname);
}

/** Aplica `sql` y registra `version` como aplicada de forma atómica (todo o nada). */
async function applyAtomically(client: PoolClient, version: string, sql: string): Promise<void> {
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
      [version]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Aplica schema.sql la primera vez (schema_migrations vacía) — salvo que las
 * tablas ya existan (caso Docker: docker-entrypoint-initdb.d ya lo aplicó
 * directamente contra Postgres al crear el volumen). schema.sql NO es
 * idempotente (CREATE TABLE sin IF NOT EXISTS), así que nunca se reaplica
 * si el esquema ya existe — solo se registra como aplicado.
 */
async function applyBaseSchemaIfNeeded(client: PoolClient, dbDir: string): Promise<void> {
  const { rows } = await client.query('SELECT COUNT(*) FROM schema_migrations');
  const count = parseInt(rows[0].count, 10);
  if (count > 0) return;

  const { rows: existsRows } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions'
    )
  `);
  const schemaAlreadyExists = existsRows[0].exists;

  if (schemaAlreadyExists) {
    console.log('[migrations] Esquema ya existente (Docker) — registrando schema base sin reaplicar.');
    await client.query(
      `INSERT INTO schema_migrations (version) VALUES ('000_schema_base') ON CONFLICT DO NOTHING`
    );
    return;
  }

  const schemaPath = path.join(dbDir, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema.sql no encontrado en ${schemaPath}`);
  }
  const schema = fs.readFileSync(schemaPath, 'utf8');
  console.log('[migrations] Aplicando schema base...');
  await applyAtomically(client, '000_schema_base', schema);
  console.log('[migrations] Schema base aplicado.');
}

// Nombre de fichero de migración válido: NNN_descripcion.sql (mismo formato
// que los ficheros existentes) — si algún .sql suelto mal nombrado acaba en
// este directorio por error, falla alto en vez de intentar ejecutarlo o
// ignorarlo en silencio.
const MIGRATION_FILENAME = /^\d{3}_.+\.sql$/;

/** Aplica, en orden, las migraciones de `dbDir/migrations` aún no registradas. */
async function applyPendingMigrations(client: PoolClient, dbDir: string): Promise<void> {
  const migrationsDir = path.join(dbDir, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[migrations] No hay directorio de migraciones. Fin.');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Orden lexicográfico: 001_, 002_, ... (ver migrations/README.md)

  for (const file of files) {
    if (!MIGRATION_FILENAME.test(file)) {
      throw new Error(`Nombre de migración inválido: "${file}" (esperado NNN_descripcion.sql)`);
    }
  }

  const appliedRes = await client.query('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRes.rows.map((r: { version: string }) => r.version));

  for (const file of files) {
    const version = file.slice(0, -'.sql'.length);
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`[migrations] Aplicando ${version}...`);
    await applyAtomically(client, version, sql);
    console.log(`[migrations] ${version} OK.`);
  }
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const dbDir = resolveDbDir();
    await applyBaseSchemaIfNeeded(client, dbDir);
    await applyPendingMigrations(client, dbDir);
  } finally {
    client.release();
  }
}
