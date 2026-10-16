import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Ventas y permutas de un activo agrupadas por operación (#284). Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

async function wallet(): Promise<string> {
  return (await pool.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
}

async function tx(op: string, at: string, asset: string, qty: number): Promise<string> {
  const r = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ($1, $2, $3, $4, $4, $5) RETURNING id`, [op, at, asset, qty, await wallet()],
  );
  return r.rows[0].id;
}

async function lot(asset: string, at: string, qty: number, price: number): Promise<string> {
  const open = await tx('BUY', at, asset, qty);
  const r = await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ($1, $2, 0, 0, $3, $4, $5, $6, TRUE) RETURNING id`, [asset, qty, price, open, at, await wallet()],
  );
  return r.rows[0].id;
}

async function consume(lotId: string, txId: string, at: string, qty: number, proceeds: number, gain: number, type: 'GAIN' | 'LOSS' | 'NONE') {
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [lotId, txId, qty, proceeds - gain, proceeds, gain, type, at],
  );
}

describe('GET /api/v1/fifo/sales/:asset (#284)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const a = await lot('XRP', '2024-01-01T10:00:00Z', 100, 0.5);
    const b = await lot('XRP', '2024-02-01T10:00:00Z', 100, 0.7);
    // Una venta que consume dos lotes: cuenta como una sola.
    const sell = await tx('SELL', '2024-03-01T10:00:00Z', 'XRP', 150);
    await consume(a, sell, '2024-03-01T10:00:00Z', 100, 60, 10, 'GAIN');
    await consume(b, sell, '2024-03-01T10:00:00Z', 50, 30, -5, 'LOSS');
    // Una permuta posterior: compra de otro activo pagada con XRP.
    const swap = await tx('BUY', '2024-04-01T10:00:00Z', 'ADA', 50);
    await consume(b, swap, '2024-04-01T10:00:00Z', 49, 20, -15, 'LOSS');
    // Comisión pagada con XRP: suma al realizado, pero no es una venta.
    const fee = await tx('FEE_EXCHANGE', '2024-04-15T10:00:00Z', 'XRP', 1);
    await consume(b, fee, '2024-04-15T10:00:00Z', 1, 0.8, 0.1, 'GAIN');
    // Un traspaso sin efecto fiscal: no cuenta.
    const transfer = await tx('WITHDRAW', '2024-05-01T10:00:00Z', 'XRP', 1);
    await consume(a, transfer, '2024-05-01T10:00:00Z', 1, 0, 0, 'NONE');
    // Otro activo: no aparece.
    const btc = await lot('BTC', '2024-01-01T10:00:00Z', 1, 40000);
    await consume(btc, await tx('SELL', '2024-03-01T10:00:00Z', 'BTC', 1), '2024-03-01T10:00:00Z', 1, 50000, 10000, 'GAIN');
    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('agrupa los consumos por operación, en orden cronológico', async () => {
    const res = await request(app).get('/api/v1/fifo/sales/xrp');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ asset: 'XRP', count: 2, realizedEur: -9.9, otherRealizedEur: 0.1, lastSaleAt: '2024-04-01T10:00:00.000Z' });
    expect(res.body.sales[0]).toMatchObject({ kind: 'venta', quantity: 150, proceedsEur: 90, gainLossEur: 5 });
    expect(res.body.sales[0].priceEur).toBeCloseTo(0.6, 9);
    expect(res.body.sales[1]).toMatchObject({ kind: 'permuta', quantity: 49, gainLossEur: -15 });
  });

  it('el realizado coincide con /api/fifo/realized-pnl', async () => {
    const sales = (await request(app).get('/api/v1/fifo/sales/XRP')).body;
    const agg = (await request(app).get('/api/fifo/realized-pnl')).body.byAsset.find((r: { asset: string }) => r.asset === 'XRP');
    expect(sales.realizedEur).toBeCloseTo(parseFloat(agg.net_pnl), 2);
  });

  it('400 para un símbolo inválido; vacío para un activo sin ventas', async () => {
    expect((await request(app).get('/api/v1/fifo/sales/..%2Fetc')).status).toBe(400);
    const none = await request(app).get('/api/v1/fifo/sales/ADA');
    expect(none.status).toBe(200);
    expect(none.body).toMatchObject({ count: 0, realizedEur: 0, otherRealizedEur: 0, lastSaleAt: null, sales: [] });
  });
});
