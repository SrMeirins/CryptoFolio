import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

vi.mock('../modules/prices/binance', () => ({ getHistoricalPriceEur: vi.fn(async () => 1) }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

async function lostTx(asset: string, notes: string | null) {
  const buy = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('BUY', '2024-01-01T10:00:00Z', $1, 1, 1, $2) RETURNING id`, [asset, walletId]);
  const lot = await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ($1, 1, 0, 100, 100, $2, '2024-01-01T10:00:00Z', $3, TRUE) RETURNING id`, [asset, buy.rows[0].id, walletId]);
  const lost = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, notes)
     VALUES ('LOST', '2025-03-01T10:00:00Z', $1, 1, 1, $2, $3) RETURNING id`, [asset, walletId, notes]);
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, 1, 100, 0, -100, 'LOSS', '2025-03-01T10:00:00Z')`, [lot.rows[0].id, lost.rows[0].id]);
}

describe('GET /api/fiscal/:year/events — aviso LOST sin motivo', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('W', 'exchange') RETURNING id`)).rows[0].id;
    await lostTx('ETH', null);
    await lostTx('NFT', 'Estafa — denuncia presentada');
    app = (await import('../app')).default;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('marca el LOST sin motivo y no el que lo tiene anotado', async () => {
    const res = await request(app).get('/api/fiscal/2025/events');
    const ev = (a: string) => res.body.fiscalEvents.find((e: { activoTransmitido: string }) => e.activoTransmitido === a);
    expect(ev('ETH').lostSinMotivo).toBe(true);
    expect(ev('NFT').lostSinMotivo).toBe(false);
  });
});
