import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Mock del cliente DB: se configura por test. Declarado con vi.hoisted para que
// esté disponible en la factoría de vi.mock (que se eleva sobre los imports).
const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock('../../db/client', () => ({ db: { query: queryMock } }));

// ────────────────────────────────────────────────────────────────────────────
// 1) Mapeo LUNC → Binance LUNCUSDT (esquema + migración 017). Requiere Postgres.
// ────────────────────────────────────────────────────────────────────────────
describe('mapeo LUNC → Binance LUNCUSDT (regresión de precio)', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  }, 30000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it('schema.sql siembra LUNC con par Binance LUNCUSDT y sin el id erróneo de LUNA 2.0', async () => {
    const pool = new Pool({ connectionString: testDb.connectionString });
    try {
      const { rows } = await pool.query(
        `SELECT price_source, binance_usdt_pair, coingecko_id
         FROM asset_metadata WHERE symbol = 'LUNC'`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].price_source).toBe('usdt_proxy');
      expect(rows[0].binance_usdt_pair).toBe('LUNCUSDT');
      // 'terra-luna' es la nueva LUNA 2.0 (precio ~1000x). No debe quedar.
      expect(rows[0].coingecko_id).toBeNull();
    } finally {
      await pool.end();
    }
  });

  it('la migración 017 repara un LUNC heredado roto y purga sus centinelas -1', async () => {
    const pool = new Pool({ connectionString: testDb.connectionString });
    try {
      // Estado heredado: LUNC mal mapeado + precio envenenado como 'no_data' (-1).
      await pool.query(
        `UPDATE asset_metadata
            SET price_source = 'coingecko', coingecko_id = 'terra-luna', binance_usdt_pair = NULL
          WHERE symbol = 'LUNC'`
      );
      await pool.query(
        `INSERT INTO price_cache (asset, price_eur, price_date, source)
         VALUES ('LUNC', -1, '2022-12-10', 'no_data')`
      );

      const sql = readFileSync(
        path.join(__dirname, '../../db/migrations/017_lunc_binance_pair.sql'),
        'utf-8'
      );
      await pool.query(sql);

      const meta = await pool.query(
        `SELECT price_source, binance_usdt_pair, coingecko_id
         FROM asset_metadata WHERE symbol = 'LUNC'`
      );
      const sentinel = await pool.query(
        `SELECT 1 FROM price_cache WHERE asset = 'LUNC' AND price_eur < 0`
      );

      expect(meta.rows[0].price_source).toBe('usdt_proxy');
      expect(meta.rows[0].binance_usdt_pair).toBe('LUNCUSDT');
      expect(meta.rows[0].coingecko_id).toBeNull();
      expect(sentinel.rows).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2) CoinGecko prefetch: una fecha ausente del market_chart/range NO se envenena
//    con un centinela -1; cae al snapshot /history. No requiere Postgres.
// ────────────────────────────────────────────────────────────────────────────
describe('CoinGecko prefetch: no envenena fechas ausentes en el rango', () => {
  let cg: typeof import('./coingecko');
  let inserts: unknown[][];

  beforeAll(async () => {
    // Intervalo de cola a 0 para un test determinista y rápido (default en prod: 6500).
    process.env.COINGECKO_MIN_INTERVAL_MS = '0';
    cg = await import('./coingecko');
  });

  const mkResponse = (payload: unknown) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => payload,
  });

  beforeEach(() => {
    inserts = [];
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/asset_metadata/.test(sql)) return { rows: [{ symbol: 'FOO', coingecko_id: 'foo-coin' }] };
      if (/FROM price_cache WHERE asset = \$1 AND price_date = ANY/.test(sql)) return { rows: [] };
      if (/SELECT price_eur FROM price_cache/.test(sql)) return { rows: [] };
      if (/^INSERT INTO price_cache/.test(sql)) { inserts.push(params ?? []); return { rows: [] }; }
      return { rows: [] };
    });

    const ts1 = Date.UTC(2024, 0, 15); // cubierto por el rango
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('market_chart/range')) return mkResponse({ prices: [[ts1, 0.5]] });
      if (url.includes('/history?date=')) return mkResponse({ market_data: { current_price: { eur: 1.23 } } });
      return mkResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    queryMock.mockReset();
  });

  it('recupera vía /history la fecha que faltaba en el rango y nunca escribe -1', async () => {
    await cg.loadAssetMetadata();

    const d1 = new Date(Date.UTC(2024, 0, 15)); // en el rango
    const d2 = new Date(Date.UTC(2024, 0, 16)); // fuera del rango → snapshot /history
    await cg.prefetchHistoricalPrices([
      { symbol: 'FOO', date: d1 },
      { symbol: 'FOO', date: d2 },
    ]);

    // Ningún INSERT escribe centinela -1 (antes del fix, la fecha ausente se envenenaba).
    expect(inserts.every(p => p[1] !== -1)).toBe(true);

    // La fecha ausente se resolvió desde el snapshot /history (precio 1.23 @ 2024-01-16).
    expect(inserts.some(p => p[1] === 1.23 && p[2] === '2024-01-16')).toBe(true);
    // La fecha del rango se persistió con su precio real.
    expect(inserts.some(p => p[2] === '2024-01-15')).toBe(true);
    // Se llamó efectivamente al endpoint de snapshot por fecha.
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/history?date='), expect.anything());
  });
});
