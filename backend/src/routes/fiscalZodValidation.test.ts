import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Valida que POST /api/fiscal/simulate-sale usa un schema Zod equivalente a
// la validación manual `typeof` que tenía antes, con el mismo comportamiento
// para peticiones válidas y mensajes 400 claros para las inválidas.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

describe('routes/fiscal — simulate-sale validación Zod', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(
      `INSERT INTO wallets (name, type) VALUES ('Wallet fiscal zod', 'hardware') RETURNING id`
    );
    walletId = wallet.rows[0].id;

    const tx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('BUY', NOW(), 'BTC', 10, 10, $1) RETURNING id`,
      [walletId]
    );
    await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
       VALUES ('BTC', 10, 10, 0, 0, $1, NOW(), $2, FALSE)`,
      [tx.rows[0].id, walletId]
    );

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('rechaza con 400 cuando quantity es un string en vez de number', async () => {
    const res = await request(app)
      .post('/api/fiscal/simulate-sale')
      .send({ asset: 'BTC', quantity: '5', priceEur: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('rechaza con 400 cuando quantity es negativo o cero', async () => {
    const res = await request(app)
      .post('/api/fiscal/simulate-sale')
      .send({ asset: 'BTC', quantity: 0, priceEur: 100 });

    expect(res.status).toBe(400);
  });

  it('rechaza con 400 cuando priceEur es negativo', async () => {
    const res = await request(app)
      .post('/api/fiscal/simulate-sale')
      .send({ asset: 'BTC', quantity: 1, priceEur: -1 });

    expect(res.status).toBe(400);
  });

  it('acepta una petición válida y se comporta igual que antes (200)', async () => {
    const res = await request(app)
      .post('/api/fiscal/simulate-sale')
      .send({ asset: 'BTC', quantity: 1, priceEur: 100 });

    expect(res.status).toBe(200);
    expect(res.body.lotsConsumed).toBeDefined();
  });
});
