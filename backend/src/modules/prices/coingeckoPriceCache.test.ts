import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

let testDb: TestDatabase;
let pool: Pool;

describe('getCurrentPricesEur — no debe duplicar filas en price_cache al llamarse varias veces', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  // Antes del fix, el INSERT omitía price_date (quedaba NULL). Dos NULL nunca
  // son iguales en SQL, así que ON CONFLICT (asset, price_date) nunca frenaba
  // nada: cada llamada insertaba una fila nueva sin límite.
  it('llamar dos veces el mismo día inserta una única fila (no crece sin límite)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ bitcoin: { eur: 50000 } }),
    }) as unknown as Response));

    const { loadAssetMetadata, getCurrentPricesEur } = await import('./coingecko');
    await loadAssetMetadata();

    await getCurrentPricesEur(['BTC']);
    await getCurrentPricesEur(['BTC']);

    const res = await pool.query(
      `SELECT COUNT(*) FROM price_cache WHERE asset = 'BTC' AND source = 'coingecko_live'`
    );
    expect(Number(res.rows[0].count)).toBe(1);
  });
});
