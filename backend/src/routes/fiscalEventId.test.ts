import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Una venta que consume varios lotes genera varios eventos fiscales con el
// mismo txId; la tabla de Fiscal los usaba como clave y React duplicaba u
// omitía filas (#201). Cada evento lleva ahora un identificador propio.
vi.mock('../modules/prices/binance', () => ({ getHistoricalPriceEur: vi.fn(async () => 1) }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('GET /api/fiscal/:year/events — identificador único por evento (#201)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('W', 'exchange') RETURNING id`)).rows[0].id;

    const lot = async (fecha: string, cost: number) => {
      const tx = await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
         VALUES ('BUY', $1, 'BTC', 1, 1, $2) RETURNING id`, [fecha, walletId]);
      return (await pool.query(
        `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
         VALUES ('BTC', 1, 0, $1, $1, $2, $3, $4, TRUE) RETURNING id`, [cost, tx.rows[0].id, fecha, walletId])).rows[0].id as string;
    };
    const lotA = await lot('2024-01-01T10:00:00Z', 100);
    const lotB = await lot('2024-02-01T10:00:00Z', 200);

    // Una sola venta de 2 BTC que consume los dos lotes.
    const sell = (await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, wallet_id)
       VALUES ('SELL', '2025-03-01T10:00:00Z', 'BTC', 2, 2, 'EUR', $1) RETURNING id`, [walletId])).rows[0].id;
    for (const [lotId, cost] of [[lotA, 100], [lotB, 200]] as const) {
      await pool.query(
        `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
         VALUES ($1, $2, 1, $3, 300, $4, 'GAIN', '2025-03-01T10:00:00Z')`, [lotId, sell, cost, 300 - cost]);
    }

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('dos eventos de la misma operación tienen el mismo txId pero distinto eventId', async () => {
    const res = await request(app).get('/api/fiscal/2025/events');
    expect(res.status).toBe(200);
    const events = res.body.fiscalEvents as Array<{ txId: string; eventId: string }>;
    expect(events).toHaveLength(2);
    expect(events[0].txId).toBe(events[1].txId);
    expect(typeof events[0].eventId).toBe('string');
    expect(new Set(events.map(e => e.eventId)).size).toBe(2);
  });
});
