import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// /portfolio-history no tenía test propio. fetchMarketChart/loadAssetMetadata
// (coingecko.ts) se mockean para no depender de red — el fetch en segundo
// plano no bloquea la respuesta (fire-and-forget), así que mockearlos basta
// para evitar llamadas reales sin afectar la respuesta bajo test.
//
// runFifoEngine/db/el router se importan dinámicamente DENTRO de beforeAll,
// después de fijar DATABASE_URL — nunca como import estático (ver el
// comentario detallado en fifoAggregations.test.ts: un import estático de
// algo que toque db/client.ts se evalúa antes de que este beforeAll fije
// DATABASE_URL al valor de test, y ese módulo cachea el Pool equivocado
// para el resto del proceso — confirmado empíricamente).
const { fetchMarketChartMock, loadAssetMetadataMock } = vi.hoisted(() => ({
  fetchMarketChartMock: vi.fn(() => Promise.resolve()),
  loadAssetMetadataMock: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../modules/prices/coingecko', () => ({
  fetchMarketChart: fetchMarketChartMock,
  loadAssetMetadata: loadAssetMetadataMock,
}));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;
let db: typeof import('../../db/client')['db'];

describe('GET /api/fifo/portfolio-history', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet history test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
       VALUES ('BUY', NOW() - interval '10 days', 'BTC', 1, 1, 'EUR', 100, $1)`,
      [walletId]
    );
    ({ db } = await import('../../db/client'));
    const { runFifoEngine } = await import('../../modules/fifo/engine');
    await runFifoEngine();

    const { default: router } = await import('./portfolioHistory');
    app = express();
    app.use('/api/fifo', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('devuelve points/period/refreshing para el periodo por defecto (1y)', async () => {
    const res = await request(app).get('/api/fifo/portfolio-history');
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('1y');
    expect(Array.isArray(res.body.points)).toBe(true);
    expect(typeof res.body.refreshing).toBe('boolean');
  });

  it('acepta un period explícito (1m)', async () => {
    const res = await request(app).get('/api/fifo/portfolio-history?period=1m');
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('1m');
  });

  it('un period desconocido cae al default de 365 días sin error', async () => {
    const res = await request(app).get('/api/fifo/portfolio-history?period=no-existe');
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('no-existe');
    expect(Array.isArray(res.body.points)).toBe(true);
  });

  describe('moneda de visualización (#177)', () => {
    beforeAll(async () => {
      // BTC a 200 € y USDT a 0,80 € los últimos 12 días: 1 BTC = 200 € = 250 $.
      await pool.query(
        `INSERT INTO price_cache (asset, price_eur, source, price_date)
         SELECT a.asset, a.price, 'test', d::date
         FROM (VALUES ('BTC', 200), ('USDT', 0.8)) AS a(asset, price),
              generate_series(CURRENT_DATE - 12, CURRENT_DATE, interval '1 day') d
         ON CONFLICT (asset, price_date) DO UPDATE SET price_eur = EXCLUDED.price_eur`
      );
    });

    it('en EUR (por defecto) valora con el precio en EUR', async () => {
      const res = await request(app).get('/api/fifo/portfolio-history?period=1m');
      expect(res.body.currency).toBe('EUR');
      const last = res.body.points.at(-1);
      expect(last.value).toBe(200);
    });

    it('en USD divide el valor de cada día por el precio de USDT de ese día', async () => {
      const res = await request(app).get('/api/fifo/portfolio-history?period=1m&currency=USD');
      expect(res.status).toBe(200);
      expect(res.body.currency).toBe('USD');
      const eur = await request(app).get('/api/fifo/portfolio-history?period=1m');
      expect(res.body.points.map((p: { date: string }) => p.date)).toEqual(eur.body.points.map((p: { date: string }) => p.date));
      for (const p of res.body.points) expect(p.value).toBe(250);
    });

    it('rechaza una moneda no soportada con 400', async () => {
      const res = await request(app).get('/api/fifo/portfolio-history?period=1m&currency=GBP');
      expect(res.status).toBe(400);
    });
  });

  it('un fallo interno devuelve un mensaje genérico, no (err as Error).message', async () => {
    const spy = vi.spyOn(db, 'query').mockRejectedValueOnce(new Error('detalle interno sensible: fallo de Postgres'));

    const res = await request(app).get('/api/fifo/portfolio-history?period=1m');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.error).not.toContain('detalle interno sensible');
    spy.mockRestore();
  });
});
