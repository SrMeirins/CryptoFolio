import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// GET /stats y GET / (listado con filtros) no tenían NINGÚN test propio.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

describe('routes/transactions — listado y stats', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet list test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id, manually_added)
       VALUES ('BUY', '2024-01-01T00:00:00Z', 'BTC', 1, 1, 'EUR', 100, $1, true)`,
      [walletId]
    );
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id, manually_added)
       VALUES ('SELL', '2024-02-01T00:00:00Z', 'BTC', 0.5, 0.5, 'EUR', 60, $1, false)`,
      [walletId]
    );

    const { default: router } = await import('./transactionsList');
    app = express();
    app.use('/api/transactions', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  describe('GET /stats', () => {
    it('agrega total_ops, total_buys, total_sells correctamente', async () => {
      const res = await request(app).get('/api/transactions/stats');
      expect(res.status).toBe(200);
      expect(res.body.totals.total_ops).toBe(2);
      expect(res.body.totals.total_buys).toBe(1);
      expect(res.body.totals.total_sells).toBe(1);
      expect(res.body.totals.total_manual).toBe(1);
    });
  });

  describe('GET /', () => {
    it('sin filtros, devuelve las 2 transacciones con el total agregado', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.transactions).toHaveLength(2);
    });

    it('filtra por type', async () => {
      const res = await request(app).get('/api/transactions?type=SELL');
      expect(res.body.total).toBe(1);
      expect(res.body.transactions[0].operation_type).toBe('SELL');
    });

    it('filtra por manually_added=false', async () => {
      const res = await request(app).get('/api/transactions?manually_added=false');
      expect(res.body.total).toBe(1);
      expect(res.body.transactions[0].operation_type).toBe('SELL');
    });

    it('filtra por asset (insensible a mayúsculas en la entrada)', async () => {
      const res = await request(app).get('/api/transactions?asset=btc');
      expect(res.body.total).toBe(2);
    });

    it('respeta limit/offset', async () => {
      const res = await request(app).get('/api/transactions?limit=1&offset=0');
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.total).toBe(2);
      expect(res.body.limit).toBe(1);
    });

    it('search busca por notes/asset con ILIKE', async () => {
      const res = await request(app).get('/api/transactions?search=BTC');
      expect(res.body.total).toBe(2);
    });
  });
});
