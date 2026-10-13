import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Saldos y flujo de EUR con la definición común de movimientos (#169):
// depósitos con tarjeta OCBS (ya como DEPOSIT_FIAT) y ventas cuyo activo es EUR.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('routes/fifo — movimientos de EUR (#169)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const spot = (await pool.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;

    const insert = (op: string, ts: string, asset: string, amount: number, cost: [string, number] | null, notes: string | null = null) =>
      pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id, notes)
         VALUES ($1::operation_type, $2, $3, $4, $4, $5, $6, $7, $8)`,
        [op, ts, asset, amount, cost?.[0] ?? null, cost?.[1] ?? null, spot, notes],
      );
    await insert('DEPOSIT_FIAT', '2026-01-01T10:00:00Z', 'EUR', 100, null, 'Deposit Fiat OCBS'); // depósito con tarjeta
    await insert('BUY', '2026-01-01T10:00:01Z', 'XRP', 60, ['EUR', 60]);                       // compra pagada en EUR
    await insert('SELL', '2026-01-02T10:00:00Z', 'EUR', 30, ['XRP', 30]);                      // EUR entregados por XRP
    await insert('WITHDRAW_FIAT', '2026-01-03T10:00:00Z', 'EUR', 5, null);

    const { default: router } = await import('./fifoAggregations');
    app = express();
    app.use('/api/fifo', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('GET /fiat-balances resta las ventas de EUR y cuenta los depósitos con tarjeta', async () => {
    const res = await request(app).get('/api/fifo/fiat-balances');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Number(res.body[0].balance)).toBe(5);       // 100 − 60 − 30 − 5
  });

  it('GET /eur-flow incluye el depósito con tarjeta y la venta de EUR como compra de cripto', async () => {
    const res = await request(app).get('/api/fifo/eur-flow');
    expect(res.body).toMatchObject({ deposited: 100, withdrawn: 5, netFromBank: 95, eurSpentBuying: 90, eurReceivedSelling: 0 });
  });
});
