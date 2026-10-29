import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Resumen del Historial coherente (#403): compras y ventas según el lado del
// fiat, neto recuperado, G/P y contrapartida de las ventas, y la operativa de
// margen fuera por defecto. Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
const ids: Record<string, string> = {};
const AT = '2025-03-01T10:00:00Z';

async function tx(key: string, f: Record<string, unknown>): Promise<string> {
  const cols = Object.keys(f);
  const r = await pool.query(
    `INSERT INTO transactions (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(f),
  );
  ids[key] = r.rows[0].id;
  return ids[key];
}
/** Lote abierto por `openTx` y consumido por `consumingTx` con su valor de transmisión y G/P. */
async function sale(openTx: string, consumingTx: string, asset: string, wallet: string, proceeds: number, gain: number) {
  const lot = (await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, fee_eur, open_transaction_id, opened_at, wallet_id)
     VALUES ($1, 1, 0, $2, $2, 0, $3, NOW(), $4) RETURNING id`, [asset, proceeds - gain, openTx, wallet])).rows[0].id;
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, 1, $3, $4, $5, $6, NOW())`, [lot, consumingTx, proceeds - gain, proceeds, gain, gain >= 0 ? 'GAIN' : 'LOSS']);
}

describe('GET /api/v1/historial/estadisticas — resumen coherente (#403)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = (await import('../../db/client')).pool;
    const spot = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Spot test', 'exchange') RETURNING id`)).rows[0].id;
    const margin = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Margen test', 'exchange') RETURNING id`)).rows[0].id;
    const s = { wallet_id: spot, account: 'Spot', timestamp: AT };
    const mg = { wallet_id: margin, account: 'Cross Margin', timestamp: AT };

    // Spot: compra con EUR (100) y compra registrada como venta de EUR (30 EUR por USDC).
    await tx('buyEur', { ...s, operation_type: 'BUY', asset: 'BTC', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 100 });
    await tx('sellEur', { ...s, operation_type: 'SELL', asset: 'EUR', amount: 30, amount_net: 30, cost_asset: 'USDC', cost_amount: 31 });
    // Spot: venta registrada como compra de EUR (20 EUR por ADA, +5) y venta de BTC por USDT (60, +10).
    await tx('buyFiat', { ...s, operation_type: 'BUY', asset: 'EUR', amount: 20, amount_net: 20, cost_asset: 'ADA', cost_amount: 50 });
    await sale(ids.buyEur, ids.buyFiat, 'ADA', spot, 20, 5);
    await tx('sellBtc', { ...s, operation_type: 'SELL', asset: 'BTC', amount: 0.5, amount_net: 0.5, cost_asset: 'USDT', cost_amount: 60 });
    await sale(ids.buyEur, ids.sellBtc, 'BTC', spot, 60, 10);
    // Margen: traspaso desde Spot, préstamo y venta con pérdida (500, -50).
    await tx('toMargin', { ...s, operation_type: 'TRANSFER_INTERNAL', asset: 'USDT', amount: 10, amount_net: 10, destination_wallet_id: margin });
    await tx('borrow', { ...mg, operation_type: 'MARGIN_BORROW', asset: 'USDT', amount: 100, amount_net: 100 });
    await tx('sellMargin', { ...mg, operation_type: 'SELL', asset: 'ETH', amount: 1, amount_net: 1, cost_asset: 'USDT', cost_amount: 500 });
    await sale(ids.borrow, ids.sellMargin, 'ETH', margin, 500, -50);

    const { default: stats } = await import('./estadisticas');
    app = express();
    app.use('/api/v1/historial/estadisticas', stats);
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  const get = async (qs = '') => (await request(app).get(`/api/v1/historial/estadisticas${qs ? `?${qs}` : ''}`)).body;

  it('Invertido incluye la compra registrada como venta de fiat, con lo recuperado para el neto', async () => {
    const { totals } = await get();
    expect(totals.fiat_buys).toBe(2);
    expect(totals.invested.EUR).toBeCloseTo(130, 8);
    expect(totals.recovered.EUR).toBeCloseTo(20, 8);
  });

  it('Ventas cuenta la venta registrada como compra de fiat, con su G/P y contrapartida', async () => {
    const { totals } = await get();
    expect(totals.sells).toBe(2);
    expect(totals.sold.EUR).toBeCloseTo(80, 8);
    expect(totals.sold_gp.EUR).toBeCloseTo(15, 8);
    expect(totals.sold_by_counterpart.fiat).toMatchObject({ ops: 1, value: { EUR: 20 } });
    expect(totals.sold_by_counterpart.stablecoin.ops).toBe(1);
    expect(totals.sold_by_counterpart.cripto.ops).toBe(0);
  });

  it('por defecto sin margen: fuera la cuenta de margen, los préstamos y el traspaso a la wallet de margen', async () => {
    const d = await get();
    expect(d.margin).toEqual({ included: false, ops: 3, sells: 1 });
    expect(d.totals.ops).toBe(4);
  });

  it('con incluir_margen=true suma también el margen', async () => {
    const d = await get('incluir_margen=true');
    expect(d.margin).toEqual({ included: true, ops: 3, sells: 1 });
    expect(d.totals.ops).toBe(7);
    expect(d.totals.sells).toBe(3);
    expect(d.totals.sold.EUR).toBeCloseTo(580, 8);
    expect(d.totals.sold_gp.EUR).toBeCloseTo(-35, 8);
    // El gráfico sigue al resumen: las ventas del mes incluyen la de margen.
    const ventasMarzo = async (qs: string) => (await get(`date_from=2025-01-01&date_to=2025-12-31${qs}`))
      .chart.buckets.find((b: { periodo: string }) => b.periodo === '2025-03').ops.ventas;
    expect(await ventasMarzo('&incluir_margen=true')).toBe(3);
    expect(await ventasMarzo('')).toBe(2);
  });

  it('incluir_margen inválido: 400 legible', async () => {
    const res = await request(app).get('/api/v1/historial/estadisticas?incluir_margen=si');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('incluir_margen');
  });
});
