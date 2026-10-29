import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 018 (#449): id de CoinGecko solo para el logo y origen de cada logo.
// Idempotente, reversible y con sus restricciones. La base de test se crea desde
// schema.sql, que ya incluye las columnas.
const up = readFileSync(path.join(__dirname, 'migrations/018_origen_logos.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/018_origen_logos.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const columns = async () => (await pool.query(
  `SELECT column_name FROM information_schema.columns
   WHERE (table_name = 'asset_metadata' AND column_name IN ('icon_coingecko_id', 'icon_id_source'))
      OR (table_name = 'asset_icons' AND column_name = 'source') ORDER BY 1`)).rows.map(r => r.column_name);

describe('migración 018_origen_logos', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente sobre un esquema que ya tiene las columnas', async () => {
    await pool.query(up);
    await pool.query(up);
    expect(await columns()).toEqual(['icon_coingecko_id', 'icon_id_source', 'source']);
  });

  it('valida el id y su origen, que van juntos', async () => {
    await pool.query(`UPDATE asset_metadata SET icon_coingecko_id = 'shiba-inu', icon_id_source = 'auto' WHERE symbol = 'BTC'`);
    for (const [id, src] of [['shiba-inu', null], [null, 'auto'], ['Mal Id', 'auto'], ['ok-id', 'otro']]) {
      await expect(pool.query(`UPDATE asset_metadata SET icon_coingecko_id = $1, icon_id_source = $2 WHERE symbol = 'BTC'`, [id, src])).rejects.toThrow();
    }
    await expect(pool.query(`INSERT INTO asset_icons (symbol, status, source) VALUES ('SINTM', 'missing', 'otra')`)).rejects.toThrow();
  });

  it('la reversión quita las columnas y se puede volver a aplicar', async () => {
    await pool.query(down);
    expect(await columns()).toEqual([]);
    await pool.query(up);
    expect(await columns()).toEqual(['icon_coingecko_id', 'icon_id_source', 'source']);
  });
});
