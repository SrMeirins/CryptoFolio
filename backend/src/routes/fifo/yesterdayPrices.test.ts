import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// /yesterday-prices no tenía test propio. fetchWithTimeout (recién aplicado
// en este mismo turno, antes era un fetch sin timeout) se mockea para no
// depender de la API real de Binance. El fichero mantiene una caché TTL de
// 5 min en una variable de módulo (_ydayCache) compartida por TODOS los
// tests de este fichero (una sola importación real de app, como el resto
// de la suite) — para que cada test ejerza el código de nuevo en vez de
// servirse de la caché del test anterior, se avanza Date.now() más allá del
// TTL entre tests (nunca se usa vi.resetModules con una conexión real a
// Postgres: el módulo db/client lee DATABASE_URL del process.env al
// importarse, que es global y compartido entre ficheros de test
// concurrentes — resetear forzaría una reconexión a la BD de OTRO fichero).
const { fetchWithTimeoutMock } = vi.hoisted(() => ({ fetchWithTimeoutMock: vi.fn() }));
vi.mock('../../modules/prices/httpTimeout', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}));

const YDAY_TTL = 5 * 60_000;
let fakeNow = Date.now();

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('GET /api/fifo/yesterday-prices', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    // Monta solo este router, no ../../app — ver el comentario detallado en
    // fifoRun.test.ts: importar el árbol completo de app.ts en paralelo con
    // otros ficheros de test de fifo/ haciendo lo mismo crea una ventana de
    // carrera sobre process.env.DATABASE_URL (confirmado empíricamente:
    // con ../../app este test leía datos de la BD aislada de OTRO fichero).
    const { default: router } = await import('./yesterdayPrices');
    app = express();
    app.use('/api/fifo', router);

    vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  beforeEach(() => {
    fetchWithTimeoutMock.mockReset();
  });

  it('sin lotes abiertos, devuelve {prices: {}} sin llamar a Binance', async () => {
    const res = await request(app).get('/api/fifo/yesterday-prices');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ prices: {} });
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });

  it('un fallo interno devuelve un mensaje genérico, no (err as Error).message', async () => {
    fakeNow += YDAY_TTL + 1000; // expira la caché del test anterior

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet yday test', 'hardware') RETURNING id`);
    await pool.query(
      `INSERT INTO asset_metadata (symbol, name, binance_eur_pair, price_source, is_stablecoin)
       VALUES ('YDAYTEST', 'Yday Test Coin', 'YDAYTESTEUR', 'binance', FALSE)`
    );
    const tx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('DEPOSIT_CRYPTO', NOW(), 'YDAYTEST', 1, 1, $1) RETURNING id`,
      [wallet.rows[0].id]
    );
    await pool.query(
      `INSERT INTO fifo_lots (asset, wallet_id, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, is_closed)
       VALUES ('YDAYTEST', $1, 1, 1, 10, 10, $2, NOW(), FALSE)`,
      [wallet.rows[0].id, tx.rows[0].id]
    );

    fetchWithTimeoutMock.mockRejectedValueOnce(new Error('detalle interno sensible: timeout de red'));

    const res = await request(app).get('/api/fifo/yesterday-prices');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.error).not.toContain('detalle interno sensible');
  });

  it('propaga un HTTP no-ok de Binance como error genérico (sin filtrar el status crudo al cliente)', async () => {
    fakeNow += YDAY_TTL + 1000;

    fetchWithTimeoutMock.mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    const res = await request(app).get('/api/fifo/yesterday-prices');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('resuelve el precio EUR directo cuando Binance responde correctamente', async () => {
    fakeNow += YDAY_TTL + 1000;

    fetchWithTimeoutMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ symbol: 'YDAYTESTEUR', openPrice: '42.5' }],
    } as Response);

    const res = await request(app).get('/api/fifo/yesterday-prices');

    expect(res.status).toBe(200);
    expect(res.body.prices.YDAYTEST).toBe(42.5);
  });

  it('dentro del TTL, responde desde caché sin volver a llamar a Binance', async () => {
    const res = await request(app).get('/api/fifo/yesterday-prices');
    expect(res.status).toBe(200);
    expect(res.body.prices.YDAYTEST).toBe(42.5);
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });
});
