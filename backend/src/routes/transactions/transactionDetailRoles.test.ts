import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Trazabilidad FIFO comprensible (#405). Datos sintéticos: dos compras en el
// exchange y un retiro de todo a la wallet fría que paga la red con el mismo
// activo: la comisión sale de la primera compra y el resto se traslada en dos
// lotes, uno por compra de origen.
let testDb: TestDatabase;
let app: import('express').Express;
const ids: Record<string, string> = {};
const detalle = async (key: string) => (await request(app).get(`/api/v1/transactions/${ids[key]}/detalle`)).body;

describe('detalle: papel de cada consumo y origen de cada lote (#405)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    const { pool } = await import('../../db/client');
    const ex = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Exchange', 'exchange') RETURNING id`)).rows[0].id;
    const cold = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Fría', 'hardware') RETURNING id`)).rows[0].id;
    const tx = async (key: string, f: Record<string, unknown>) => {
      const cols = Object.keys(f);
      ids[key] = (await pool.query(`INSERT INTO transactions (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, Object.values(f))).rows[0].id;
    };
    const opened = '2026-01-10T10:00:00Z';
    await tx('buyA', { operation_type: 'BUY', timestamp: opened, asset: 'SINT', amount: 10, amount_net: 10, cost_asset: 'EUR', cost_amount: 10, wallet_id: ex });
    await tx('buyB', { operation_type: 'BUY', timestamp: opened, asset: 'SINT', amount: 5, amount_net: 5, cost_asset: 'EUR', cost_amount: 5, wallet_id: ex });
    await tx('retiro', { operation_type: 'WITHDRAW', timestamp: '2026-01-11T10:00:00Z', asset: 'SINT', amount: 14, amount_net: 14,
      fee_asset: 'SINT', fee_amount: 1, wallet_id: ex, destination_wallet_id: cold });

    const lot = async (open: string, wallet: string, qty: number, remaining: number) => (await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, fee_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('SINT', $1, $2, $1, 1, 0, $3, $4, $5) RETURNING id`, [qty, remaining, open, opened, wallet])).rows[0].id;
    const consume = (lotId: string, qty: number, proceeds: number, gain: number, event: string) => pool.query(
      `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
       VALUES ($1, $2, $3, $3, $4, $5, $6, NOW())`, [lotId, ids.retiro, qty, proceeds, gain, event]);
    const a = await lot(ids.buyA, ex, 10, 0);
    const b = await lot(ids.buyB, ex, 5, 0);
    await consume(a, 1, 1.004, 0.004, 'GAIN');   // comisión de red
    await consume(a, 9, 9, 0, 'NONE');           // traslado
    await consume(b, 5, 5, 0, 'NONE');           // traslado
    await lot(ids.retiro, cold, 9, 9);
    await lot(ids.retiro, cold, 5, 5);

    const { default: router } = await import('./transactionDetail');
    app = express();
    app.use('/api/v1/transactions', router);
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  it('el retiro separa la comisión de red del traslado, con su destino', async () => {
    const d = await detalle('retiro');
    const roles = d.fifo.consumed.map((c: { role: string; quantity: number; destination_name: string }) => [c.role, c.quantity, c.destination_name]);
    expect(roles).toEqual(expect.arrayContaining([['comision_red', 1, 'Fría'], ['traslado', 9, 'Fría'], ['traslado', 5, 'Fría']]));
    expect(d.fifo.totals.gain_loss_eur).toBeCloseTo(0.004, 10);
  });

  it('cada lote trasladado enlaza a la compra de la que viene', async () => {
    const d = await detalle('retiro');
    const sources = d.fifo.opened.map((l: { quantity_original: number; source: { id: string } | null }) => [l.quantity_original, l.source?.id]);
    expect(sources).toEqual([[9, ids.buyA], [5, ids.buyB]]);
  });

  it('una compra dice quién consumió su lote, con papel y destino; un lote nacido en ella no tiene origen', async () => {
    const d = await detalle('buyA');
    expect(d.fifo.opened[0].source).toBeNull();
    const by = d.fifo.opened[0].consumed_by.map((c: { role: string; destination_name: string; quantity: number }) => [c.role, c.destination_name, c.quantity]);
    expect(by).toEqual(expect.arrayContaining([['comision_red', 'Fría', 1], ['traslado', 'Fría', 9]]));
  });
});
