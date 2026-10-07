import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// /years, /overview y /carryforward no tenían NINGÚN test propio.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

describe('routes/fiscal — overview', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet overview test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    // 2023: ganancia de 50 (BUY coste 0 → SELL con proceeds 50)
    const buyTx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('BUY', '2023-01-01T00:00:00Z', 'BTC', 1, 1, $1) RETURNING id`,
      [walletId]
    );
    const lot = await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
       VALUES ('BTC', 1, 1, 0, 0, $1, '2023-01-01T00:00:00Z', $2, FALSE) RETURNING id`,
      [buyTx.rows[0].id, walletId]
    );
    const sellTx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('SELL', '2023-06-01T00:00:00Z', 'BTC', 1, 1, $1) RETURNING id`,
      [walletId]
    );
    await pool.query(
      `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
       VALUES ($1, $2, 1, 0, 50, 50, 'GAIN', '2023-06-01T00:00:00Z')`,
      [lot.rows[0].id, sellTx.rows[0].id]
    );
    await pool.query(`UPDATE fifo_lots SET quantity_remaining = 0, is_closed = TRUE WHERE id = $1`, [lot.rows[0].id]);

    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('GET /years incluye el año sembrado', async () => {
    const res = await request(app).get('/api/fiscal/years');
    expect(res.status).toBe(200);
    expect(res.body).toContain(2023);
  });

  it('GET /overview agrega netoPatrimonial correctamente para el año sembrado', async () => {
    const res = await request(app).get('/api/fiscal/overview');
    expect(res.status).toBe(200);
    const y2023 = res.body.find((r: { year: number }) => r.year === 2023);
    expect(y2023).toBeTruthy();
    expect(y2023.netoPatrimonial).toBeCloseTo(50, 2);
    expect(y2023.numOperaciones).toBe(1);
  });

  it('GET /carryforward devuelve detalle por año con la estructura esperada', async () => {
    const res = await request(app).get('/api/fiscal/carryforward');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.detalle)).toBe(true);
    expect(typeof res.body.pendienteTotal).toBe('number');
    const entry2023 = res.body.detalle.find((d: { year: number }) => d.year === 2023);
    expect(entry2023).toBeTruthy();
    expect(entry2023.netoAntes).toBeCloseTo(50, 2);
  });
});
