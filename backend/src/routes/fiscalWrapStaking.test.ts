import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

vi.mock('../modules/prices/binance', () => ({ getHistoricalPriceEur: vi.fn(async () => 1) }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

// Permuta cripto→cripto: consume un lote de `origen` y la transacción
// consumidora (BUY de `destino`) lleva las notas indicadas.
async function permuta(origen: string, destino: string, notes: string) {
  const buy = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('BUY', '2024-01-01T10:00:00Z', $1, 1, 1, $2) RETURNING id`, [origen, walletId]);
  const lot = await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ($1, 1, 0, 100, 100, $2, '2024-01-01T10:00:00Z', $3, TRUE) RETURNING id`, [origen, buy.rows[0].id, walletId]);
  const swap = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id, notes)
     VALUES ('BUY', '2025-03-01T10:00:00Z', $1, 1, 1, $2, 1, $3, $4) RETURNING id`, [destino, origen, walletId, notes]);
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, 1, 100, 150, 50, 'GAIN', '2025-03-01T10:00:00Z')`, [lot.rows[0].id, swap.rows[0].id]);
}

describe('GET /api/fiscal/:year/events — aviso wrap ETH↔BETH', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('W', 'exchange') RETURNING id`)).rows[0].id;
    await permuta('ETH', 'BETH', 'ETH 2.0 Staking: ETH→BETH');
    await permuta('BETH', 'ETH', 'ETH 2.0 Staking Withdrawals: BETH→ETH');
    await permuta('BTC', 'XRP', 'permuta normal');
    app = (await import('../app')).default;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('marca el wrap y el unwrap de staking y no una permuta normal', async () => {
    const res = await request(app).get('/api/fiscal/2025/events');
    const ev = (a: string) => res.body.fiscalEvents.find((e: { activoTransmitido: string }) => e.activoTransmitido === a);
    expect(ev('ETH').permutaWrapStaking).toBe(true);
    expect(ev('BETH').permutaWrapStaking).toBe(true);
    expect(ev('BTC').permutaWrapStaking).toBe(false);
  });
});
