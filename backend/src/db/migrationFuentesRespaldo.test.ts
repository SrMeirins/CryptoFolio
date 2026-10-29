import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 012 (#337): fuentes de precio de respaldo. La base de test se crea
// desde schema.sql, que ya incluye los cambios. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/012_fuentes_respaldo.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/012_fuentes_respaldo.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
let dia = 0;
const cierre = (fuente: string) => pool.query(
  `INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES ('SINT', $1::date, 1, $2)`,
  [`2024-01-${String(++dia).padStart(2, '0')}`, fuente]);

describe('migración 012_fuentes_respaldo', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    // schema.sql ya tiene price_close_daily (#389): esta migración se prueba
    // sobre el estado anterior, al que lleva la reversión de la 015.
    await pool.query(readFileSync(path.join(__dirname, 'migrations/down/015_cierres_por_zona.sql'), 'utf8'));
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente, admite los cierres de las fuentes de respaldo y rechaza otras', async () => {
    await pool.query(up);
    await cierre('coinpaprika_daily');
    await cierre('okx_1d');
    await expect(cierre('inventada')).rejects.toThrow();
    await pool.query(`UPDATE asset_metadata SET coinpaprika_id = 'btc-bitcoin' WHERE symbol = 'BTC'`);
  });

  it('la reversión quita los cierres de respaldo y la columna; volver a aplicarla la recrea', async () => {
    await pool.query(down);
    expect((await pool.query(`SELECT count(*)::int AS n FROM price_close_madrid WHERE source IN ('coinpaprika_daily', 'okx_1d')`)).rows[0].n).toBe(0);
    await expect(cierre('okx_1d')).rejects.toThrow();
    await pool.query(up);
    await cierre('okx_1d');
  });
});
