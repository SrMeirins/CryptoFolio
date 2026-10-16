import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 007 (#295): año fiscal de v_fiscal_year en hora de Madrid. La base
// de test se crea desde schema.sql, que ya incluye el cambio. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/007_fiscal_year_madrid.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/007_fiscal_year_madrid.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;

const years = async () => (await pool.query(`SELECT fiscal_year FROM v_fiscal_year`)).rows.map(r => r.fiscal_year as number);

describe('migración 007_fiscal_year_madrid', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    const w = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet 007', 'hardware') RETURNING id`)).rows[0].id;
    const tx = (await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('SELL', '2024-12-31T23:30:00Z', 'BTC', 1, 1, $1) RETURNING id`, [w],
    )).rows[0].id;
    const lot = (await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
       VALUES ('BTC', 1, 0, 0, 0, $1, '2023-01-01T00:00:00Z', $2, TRUE) RETURNING id`, [tx, w],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
       VALUES ($1, $2, 1, 0, 10, 10, 'GAIN', '2024-12-31T23:30:00Z')`, [lot, tx],
    );
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y asigna las 00:30 del 1 de enero de Madrid al año nuevo', async () => {
    await pool.query(up);
    expect(await years()).toEqual([2025]);
  });

  it('la reversión vuelve al año en UTC y volver a aplicarla lo corrige', async () => {
    await pool.query(down);
    expect(await years()).toEqual([2024]);
    await pool.query(up);
    expect(await years()).toEqual([2025]);
  });
});
