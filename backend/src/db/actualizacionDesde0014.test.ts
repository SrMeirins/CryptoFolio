import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Actualización desde la v0.0.14 (versión 1.0): una base creada por la última
// release pública antes del squash de #116 debe actualizarse sin errores, sin
// perder datos y quedar equivalente a una instalación nueva. Antes del puente
// de migrations/legado, la migración 011 fallaba y la aplicación no arrancaba.
// Datos sintéticos.

const DB_DIR = __dirname;
const LEGADO = path.join(DB_DIR, 'migrations', 'legado');
const ACTUALES = path.join(DB_DIR, 'migrations');
const sqlDe = (dir: string) => readdirSync(dir).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();

let antigua: TestDatabase;
let nueva: TestDatabase;
let poolAntigua: Pool;
let poolNueva: Pool;
let pool: typeof import('./client')['pool'];
let runMigrations: typeof import('./run-migrations')['runMigrations'];

/** Estructura comparable: tablas, columnas con su tipo base y nulabilidad, y restricciones no nominales. */
async function catalogo(p: Pool): Promise<{ tablas: string[]; columnas: string[] }> {
  const tablas = await p.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY 1`);
  // Tipo base: el dominio eur_amount de una base nueva equivale a NUMERIC(38,18)
  // con su CHECK >= 0 por columna en una base actualizada.
  const columnas = await p.query(`
    SELECT c.table_name || '.' || c.column_name || ' ' ||
           CASE WHEN c.domain_name = 'eur_amount' THEN 'numeric(38,18)'
                WHEN c.data_type = 'numeric' THEN 'numeric(' || c.numeric_precision || ',' || c.numeric_scale || ')'
                ELSE c.data_type END || ' ' || c.is_nullable AS col
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.table_name <> 'schema_migrations' ORDER BY 1`);
  return { tablas: tablas.rows.map(r => r.table_name), columnas: columnas.rows.map(r => r.col) };
}

beforeAll(async () => {
  // Base como la dejaba la v0.0.14: su schema.sql, sus migraciones 002-009 y el
  // registro que hacía su runner.
  antigua = await createTestDatabase({ esquema: false });
  poolAntigua = new Pool({ connectionString: antigua.connectionString });
  await poolAntigua.query(readFileSync(path.join(__dirname, '../test/fixtures/v0.0.14/schema.sql'), 'utf8'));
  const de0014 = sqlDe(LEGADO).filter(f => f < '010');
  for (const f of de0014) await poolAntigua.query(readFileSync(path.join(LEGADO, f), 'utf8'));
  await poolAntigua.query(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await poolAntigua.query(`INSERT INTO schema_migrations (version) SELECT unnest($1::text[])`,
    [['000_schema_base', ...de0014.map(f => f.slice(0, -4))]]);
  // Una operación sintética con 10 decimales, para comprobar que sobrevive.
  await poolAntigua.query(`
    INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
    SELECT 'BUY', '2026-01-15T10:00:00Z', 'BTC', 0.1234567891, 0.1234567891, id FROM wallets WHERE name = 'Binance Spot'`);

  // Instalación nueva de referencia: schema.sql más las migraciones actuales.
  nueva = await createTestDatabase();
  poolNueva = new Pool({ connectionString: nueva.connectionString });
  for (const f of sqlDe(ACTUALES)) await poolNueva.query(readFileSync(path.join(ACTUALES, f), 'utf8'));

  process.env.DATABASE_URL = antigua.connectionString;
  ({ pool } = await import('./client'));
  ({ runMigrations } = await import('./run-migrations'));
}, 60000);

afterAll(async () => {
  await pool?.end();
  await poolAntigua?.end();
  await poolNueva?.end();
  await antigua?.teardown();
  await nueva?.teardown();
});

describe('actualización desde la v0.0.14', () => {
  it('runMigrations aplica el puente y todas las migraciones actuales sin error', async () => {
    await expect(runMigrations()).resolves.not.toThrow();
    const { rows } = await pool.query('SELECT version FROM schema_migrations');
    const versiones = new Set(rows.map((r: { version: string }) => r.version));
    for (const f of [...sqlDe(LEGADO), ...sqlDe(ACTUALES)]) expect(versiones).toContain(f.slice(0, -4));
  }, 60000);

  it('conserva los datos y amplía los importes a 18 decimales', async () => {
    const { rows } = await pool.query(`SELECT amount::text AS amount FROM transactions WHERE asset = 'BTC'`);
    expect(rows).toEqual([{ amount: '0.123456789100000000' }]);
  });

  it('queda con las mismas tablas y columnas que una instalación nueva', async () => {
    const [actualizada, referencia] = await Promise.all([catalogo(poolAntigua), catalogo(poolNueva)]);
    expect(actualizada.tablas).toEqual(referencia.tablas);
    expect(actualizada.columnas).toEqual(referencia.columnas);
  });

  it('una segunda ejecución no hace nada (el dominio eur_amount marca el puente como aplicado)', async () => {
    const antes = (await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n;
    await expect(runMigrations()).resolves.not.toThrow();
    expect((await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n).toBe(antes);
  });
});
