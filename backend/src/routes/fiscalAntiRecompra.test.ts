import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

vi.mock('../modules/prices/binance', () => ({ getHistoricalPriceEur: vi.fn(async () => 1) }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

async function buyLot(asset: string, fecha: string, qty: number, cost: number) {
  const tx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('BUY', $1, $2, $3, $3, $4) RETURNING id`, [fecha, asset, qty, walletId]);
  const lot = await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ($1, $2, $2, $3, $4, $5, $6, $7, FALSE) RETURNING id`,
    [asset, qty, cost, cost / qty, tx.rows[0].id, fecha, walletId]);
  return lot.rows[0].id as string;
}

async function sellAtLoss(lotId: string, asset: string, fecha: string, proceeds: number, cost: number) {
  const tx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, wallet_id)
     VALUES ('SELL', $1, $2, 1, 1, 'EUR', $3) RETURNING id`, [fecha, asset, walletId]);
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, 1, $3, $4, $5, 'LOSS', $6)`,
    [lotId, tx.rows[0].id, cost, proceeds, proceeds - cost, fecha]);
}

describe('GET /api/fiscal/:year/events — aviso anti-recompra (art. 33.5 LIRPF)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('W', 'exchange') RETURNING id`)).rows[0].id;

    // BTC: pérdida el 10-ene-2025 y recompra el 20-ene-2025 → afectada.
    const btcLot = await buyLot('BTC', '2024-06-01T10:00:00Z', 1, 1000);
    await sellAtLoss(btcLot, 'BTC', '2025-01-10T10:00:00Z', 800, 1000);
    await buyLot('BTC', '2025-01-20T10:00:00Z', 1, 900);

    // ETH: pérdida sin ninguna recompra → no afectada.
    const ethLot = await buyLot('ETH', '2024-06-01T10:00:00Z', 1, 500);
    await sellAtLoss(ethLot, 'ETH', '2025-01-12T10:00:00Z', 400, 500);

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('marca la pérdida con recompra en la ventana y no la que no la tiene', async () => {
    const res = await request(app).get('/api/fiscal/2025/events');
    expect(res.status).toBe(200);
    const btc = res.body.fiscalEvents.find((e: { activoTransmitido: string }) => e.activoTransmitido === 'BTC');
    const eth = res.body.fiscalEvents.find((e: { activoTransmitido: string }) => e.activoTransmitido === 'ETH');
    expect(btc.posiblePerdidaDiferida).toBe(true);
    expect(eth.posiblePerdidaDiferida).toBe(false);
  });
});
