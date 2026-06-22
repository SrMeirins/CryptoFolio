/**
 * Runner de migraciones para modo standalone / Electron.
 * En Docker el schema lo aplica el entrypoint de PostgreSQL.
 * Aquí lo hacemos nosotros.
 */
import fs from 'fs';
import path from 'path';
import { pool } from './client';

/** Busca el directorio db/ tanto en dev (src/db) como en prod (extraResources/backend/src/db) */
function resolveDbDir(): string {
  // En Electron, los recursos están en process.resourcesPath
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (process.env.ELECTRON_MODE === 'true' && resourcesPath) {
    const electronPath = path.join(resourcesPath, 'backend', 'src', 'db');
    if (fs.existsSync(electronPath)) return electronPath;
  }
  // En desarrollo / build local
  return path.join(__dirname);
}

/** Aplica `sql` y registra `version` como aplicada de forma atómica (todo o nada). */
async function applyAtomically(
  client: import('pg').PoolClient,
  version: string,
  sql: string
): Promise<void> {
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

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. Crear tabla de tracking si no existe
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const dbDir = resolveDbDir();

    // 2. Aplicar schema base si es la primera vez (no hay migraciones registradas)
    const { rows } = await client.query('SELECT COUNT(*) FROM schema_migrations');
    const count = parseInt(rows[0].count, 10);

    if (count === 0) {
      const schemaPath = path.join(dbDir, 'schema.sql');
      if (!fs.existsSync(schemaPath)) {
        throw new Error(`schema.sql no encontrado en ${schemaPath}`);
      }
      const schema = fs.readFileSync(schemaPath, 'utf8');
      console.log('[migrations] Aplicando schema base...');
      await applyAtomically(client, '000_schema_base', schema);
      console.log('[migrations] Schema base aplicado.');
    }

    // 3. Buscar y aplicar migraciones pendientes en orden
    const migrationsDir = path.join(dbDir, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[migrations] No hay directorio de migraciones. Fin.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Orden lexicográfico: 001_, 002_, ... 008_

    const appliedRes = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(appliedRes.rows.map((r: { version: string }) => r.version));

    for (const file of files) {
      const version = file.replace('.sql', '');
      if (applied.has(version)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrations] Aplicando ${version}...`);
      await applyAtomically(client, version, sql);
      console.log(`[migrations] ${version} OK.`);
    }
  } finally {
    client.release();
  }
}
