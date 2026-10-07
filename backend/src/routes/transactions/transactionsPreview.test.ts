import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// POST /manual/preview no tenía NINGÚN test propio. getHistoricalPriceEur se
// mockea para controlar el precio exacto y verificar la aritmética del
// preview sin depender de red.
const { getHistoricalPriceEurMock } = vi.hoisted(() => ({
  getHistoricalPriceEurMock: vi.fn(() => Promise.resolve(100)),
}));
vi.mock('../../modules/prices/binance', () => ({
  getHistoricalPriceEur: getHistoricalPriceEurMock,
}));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

describe('POST /api/transactions/manual/preview', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet preview test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    const { default: router } = await import('./transactionsPreview');
    app = express();
    app.use(express.json());
    app.use('/api/transactions', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('rechaza sin operationType/timestamp con 400', async () => {
    const res = await request(app).post('/api/transactions/manual/preview').send({});
    expect(res.status).toBe(400);
  });

  it('avisa de fecha futura', async () => {
    const res = await request(app).post('/api/transactions/manual/preview').send({
      operationType: 'DEPOSIT_CRYPTO', asset: 'BTC', amount: 1,
      timestamp: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(res.body.warnings.some((w: string) => w.includes('fecha introducida es futura'))).toBe(true);
  });

  it('FORK nunca consulta precio histórico (coste 0 por ley)', async () => {
    getHistoricalPriceEurMock.mockClear();
    const res = await request(app).post('/api/transactions/manual/preview').send({
      operationType: 'FORK', asset: 'BTC', amount: 1, timestamp: '2024-01-01T00:00:00.000Z',
    });
    expect(res.body.priceEur).toBeNull();
    expect(getHistoricalPriceEurMock).not.toHaveBeenCalled();
    expect(res.body.newLot).toEqual({ asset: 'BTC', quantity: 1, costBasisEur: 0, pricePerUnit: 0 });
  });

  it('BUY sin lotes previos: newLot con el coste estimado al precio histórico mockeado', async () => {
    const res = await request(app).post('/api/transactions/manual/preview').send({
      operationType: 'BUY', asset: 'ETH', amount: 2, timestamp: '2024-01-01T00:00:00.000Z',
    });
    expect(res.body.priceEur).toBe(100);
    expect(res.body.newLot).toEqual({ asset: 'ETH', quantity: 2, costBasisEur: 200, pricePerUnit: 100 });
  });

  it('SELL con lote abierto: estima la ganancia/pérdida consumiendo ese lote', async () => {
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
       VALUES ('BUY', '2024-01-01T00:00:00Z', 'SOL', 10, 10, 'EUR', 100, $1)`,
      [walletId]
    );
    const { runFifoEngine } = await import('../../modules/fifo/engine');
    await runFifoEngine();

    const res = await request(app).post('/api/transactions/manual/preview').send({
      operationType: 'SELL', asset: 'SOL', amount: 4, wallet_id: walletId,
      costAsset: 'EUR', costAmount: 60,
      timestamp: '2024-02-01T00:00:00.000Z',
    });

    expect(res.body.affectedLots).toHaveLength(1);
    expect(res.body.affectedLots[0].consumed).toBe(4);
    // coste consumido = 100 * (4/10) = 40; ganancia = 60 - 40 = 20
    expect(res.body.estimatedGainLoss).toBeCloseTo(20, 6);
  });

  it('SELL con lotes insuficientes avisa del déficit', async () => {
    const res = await request(app).post('/api/transactions/manual/preview').send({
      operationType: 'SELL', asset: 'SOL', amount: 999, wallet_id: walletId,
      timestamp: '2024-02-01T00:00:00.000Z',
    });
    expect(res.body.warnings.some((w: string) => w.includes('Lotes insuficientes'))).toBe(true);
  });

  it('TRANSFER_INTERNAL con origen y destino iguales avisa, sin mover lotes', async () => {
    const res = await request(app).post('/api/transactions/manual/preview').send({
      operationType: 'TRANSFER_INTERNAL', asset: 'SOL', amount: 1,
      wallet_id: walletId, destinationWalletId: walletId,
      timestamp: '2024-02-01T00:00:00.000Z',
    });
    expect(res.body.warnings.some((w: string) => w.includes('mismo'))).toBe(true);
    expect(res.body.transferLots).toEqual([]);
  });
});
