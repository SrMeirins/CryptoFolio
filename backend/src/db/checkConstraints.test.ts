import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

let testDb: TestDatabase;
let pool: Pool;
let walletId: string;
let txId: string;

describe('CHECK constraints — defensa en profundidad sobre fifo_lots/fifo_lot_consumptions/transactions', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('W', 'exchange') RETURNING id`)).rows[0].id;
    txId = (await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('BUY', NOW(), 'BTC', 1, 1, $1) RETURNING id`, [walletId]
    )).rows[0].id;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('rechaza quantity_remaining negativo', async () => {
    await expect(pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('BTC', 1, -1, 100, 100, $1, NOW(), $2)`, [txId, walletId]
    )).rejects.toThrow();
  });

  it('rechaza quantity_remaining > quantity_original', async () => {
    await expect(pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('BTC', 1, 2, 100, 100, $1, NOW(), $2)`, [txId, walletId]
    )).rejects.toThrow();
  });

  it('rechaza un lote cerrado con remanente relevante', async () => {
    await expect(pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
       VALUES ('BTC', 1, 0.5, 100, 100, $1, NOW(), $2, TRUE)`, [txId, walletId]
    )).rejects.toThrow();
  });

  it('acepta un lote válido normal', async () => {
    await expect(pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('BTC', 1, 1, 100, 100, $1, NOW(), $2)`, [txId, walletId]
    )).resolves.toBeDefined();
  });

  it('rechaza amount negativo en transactions', async () => {
    await expect(pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('BUY', NOW(), 'BTC', -1, -1, $1)`, [walletId]
    )).rejects.toThrow();
  });
});
