import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 006 (#277): pares quitados a mano. La base de test se crea desde
// schema.sql, que ya incluye la columna.
const up = readFileSync(path.join(__dirname, 'migrations/006_asset_disabled_pairs.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/006_asset_disabled_pairs.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;

const hasColumn = async () => (await pool.query(
  `SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_metadata' AND column_name = 'disabled_pairs'`,
)).rows.length === 1;

describe('migración 006_asset_disabled_pairs', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y deja la lista vacía por defecto en los activos existentes', async () => {
    expect(await hasColumn()).toBe(true);
    await pool.query(up);
    const row = (await pool.query(`SELECT disabled_pairs FROM asset_metadata WHERE symbol = 'XRP'`)).rows[0];
    expect(row.disabled_pairs).toEqual([]);
  });

  it('la reversión quita la columna y volver a aplicarla la recrea vacía', async () => {
    await pool.query(down);
    expect(await hasColumn()).toBe(false);
    await pool.query(up);
    expect(await hasColumn()).toBe(true);
    expect((await pool.query(`SELECT count(*)::int AS n FROM asset_metadata WHERE disabled_pairs <> '{}'`)).rows[0].n).toBe(0);
  });
});
