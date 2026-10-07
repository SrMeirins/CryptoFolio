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

  it('un fallo interno devuelve un mensaje genérico, no (err as Error).message', async () => {
    const spy = vi.spyOn(db, 'query').mockRejectedValueOnce(new Error('detalle interno sensible: fallo de Postgres'));

    const res = await request(app).get('/api/fifo/portfolio-history?period=1m');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.error).not.toContain('detalle interno sensible');
    spy.mockRestore();
  });
});
