import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

let testDb: TestDatabase;
let pool: Pool;

describe('FK fifo_lots/fifo_lot_consumptions → RESTRICT explícito', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('bloquea borrar una transacción que todavía abrió un lote', async () => {
    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('W', 'exchange') RETURNING id`);
    const tx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('BUY', NOW(), 'BTC', 1, 1, $1) RETURNING id`, [wallet.rows[0].id]);
    await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('BTC', 1, 1, 100, 100, $1, NOW(), $2)`, [tx.rows[0].id, wallet.rows[0].id]);

    await expect(pool.query(`DELETE FROM transactions WHERE id = $1`, [tx.rows[0].id])).rejects.toThrow();
  });
});
