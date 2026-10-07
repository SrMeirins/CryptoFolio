import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Cobertura nueva del fix de fuga de fifoError en los 3 endpoints de
// escritura — antes devolvían (err as Error).message crudo del motor FIFO.
// getHistoricalPriceEur se mockea para no depender de red. El router se
// importa dinámicamente DESPUÉS de fijar DATABASE_URL (ver el comentario
// detallado en modules/csv/confirmImport.test.ts).
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

describe('routes/transactions — escritura', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet write test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    const { default: router } = await import('./transactionsWrite');
    app = express();
    app.use(express.json());
    app.use('/api/transactions', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('POST /manual crea la transacción y devuelve el resultado real del motor FIFO', async () => {
    const res = await request(app).post('/api/transactions/manual').send({
      operationType: 'DEPOSIT_CRYPTO',
      asset: 'BTC',
      amount: 1,
      wallet_id: walletId,
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.fifo.lotsCreated).toBeGreaterThanOrEqual(1);
    expect(res.body.fifoError).toBeUndefined();
  });

  it('PUT /:id edita la transacción y recalcula FIFO', async () => {
    const tx = await pool.query(`SELECT id FROM transactions WHERE asset = 'BTC' LIMIT 1`);
    const res = await request(app).put(`/api/transactions/${tx.rows[0].id}`).send({
      operationType: 'DEPOSIT_CRYPTO',
      asset: 'BTC',
      amount: 2,
      wallet_id: walletId,
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.fifo).toBeTruthy();
  });

  it('DELETE /:id solo permite borrar transacciones manuales (403 si no lo es)', async () => {
    const importRes = await pool.query(`INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('x.csv', 'hash1', 'binance') RETURNING id`);
    const nonManual = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, manually_added, import_id)
       VALUES ('DEPOSIT_CRYPTO', NOW(), 'ETH', 1, 1, $1, false, $2) RETURNING id`,
      [walletId, importRes.rows[0].id]
    );

    const res = await request(app).delete(`/api/transactions/${nonManual.rows[0].id}`);
    expect(res.status).toBe(403);
  });

  it('DELETE /:id borra una transacción manual y recalcula FIFO', async () => {
    const tx = await pool.query(`SELECT id FROM transactions WHERE asset = 'BTC' LIMIT 1`);
    const res = await request(app).delete(`/api/transactions/${tx.rows[0].id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await pool.query('SELECT id FROM transactions WHERE id = $1', [tx.rows[0].id]);
    expect(check.rows).toHaveLength(0);
  });
});
