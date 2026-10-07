import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// routes/fifo.ts (ahora fragmentado en routes/fifo/) no tenía NINGÚN test
// propio pese a ser la superficie HTTP del motor más crítico del backend.
// prefetchHistoricalPrices hace fetch real contra Binance/CoinGecko — se
// mockea para no depender de red en CI (mismo patrón que
// transactionsZodValidation.test.ts).
const { loadAssetMetadataMock, prefetchHistoricalPricesMock } = vi.hoisted(() => ({
  loadAssetMetadataMock: vi.fn(() => Promise.resolve()),
  prefetchHistoricalPricesMock: vi.fn(() => Promise.resolve()),
}));
// runFifoEngine (vía acquisitionHandlers.ts) también importa
// getHistoricalPriceEur del mismo módulo para calcular cost basis cuando
// una adquisición no trae cost_asset — sin mockearla aquí, el motor falla
// en tiempo de ejecución (vi.mock sustituye el módulo entero, no solo los
// exports mencionados) y el error queda absorbido en errors[] en vez de
// crear el lote, dando lotsCreated:0 sin que el endpoint reporte status 500.
vi.mock('../../modules/prices/binance', () => ({
  loadAssetMetadata: loadAssetMetadataMock,
  prefetchHistoricalPrices: prefetchHistoricalPricesMock,
  getHistoricalPriceEur: vi.fn(() => Promise.resolve(100)),
}));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

describe('POST /api/fifo/run', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet FIFO run test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    // Monta solo este router (no toda la app vía ../../app) y se importa
    // dinámicamente aquí dentro, después de fijar DATABASE_URL — mismo
    // motivo que en fifoAggregations.test.ts: cualquier import de algo que
    // toque db/client.ts debe ser dinámico y posterior a esta asignación,
    // nunca un import estático del fichero.
    const { default: router } = await import('./fifoRun');
    app = express();
    app.use('/api/fifo', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('ejecuta el motor y crea un lote a partir de un DEPOSIT_CRYPTO real', async () => {
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('DEPOSIT_CRYPTO', NOW(), 'BTC', 1, 1, $1)`,
      [walletId]
    );

    const res = await request(app).post('/api/fifo/run');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.lotsCreated).toBeGreaterThanOrEqual(1);
    expect(res.body.errors).toEqual([]);
  });

  it('un fallo interno devuelve un mensaje genérico, no (err as Error).message', async () => {
    loadAssetMetadataMock.mockRejectedValueOnce(new Error('detalle interno sensible: fallo de conexión a Binance'));

    const res = await request(app).post('/api/fifo/run');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.error).not.toContain('detalle interno sensible');
  });
});
