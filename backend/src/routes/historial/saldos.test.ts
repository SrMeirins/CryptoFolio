import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Saldo corrido (#380) con el motor FIFO real y datos sintéticos: compra,
// transferencia interna, permuta con comisión agrupada, venta con hueco y
// retiro con destino pendiente. Precios simulados (sin red).
vi.mock('../../modules/prices/binance', () => ({ getHistoricalPriceEur: vi.fn(() => Promise.resolve(1)) }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let runFifo: () => Promise<{ shortfalls: unknown[] }>;
const ids: Record<string, string> = {};
let w1: string;
let w2: string;

async function tx(key: string, f: Record<string, unknown>) {
  const cols = Object.keys(f);
  ids[key] = (await pool.query(
    `INSERT INTO transactions (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(f))).rows[0].id;
}
const saldos = async (qs: string) => (await request(app).get(`/api/v1/historial/saldos?${qs}`)).body;
const byId = (rows: { id: string; balance: number; missing: number | null }[], key: string) => rows.find(r => r.id === ids[key]);
const all = () => Object.values(ids).join(',');

describe('GET /api/v1/historial/saldos (#380)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = (await import('../../db/client')).pool;
    w1 = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Exchange sintético', 'exchange') RETURNING id`)).rows[0].id;
    w2 = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Fría sintética', 'hardware') RETURNING id`)).rows[0].id;
    const base = { wallet_id: w1, manually_added: true };
    await tx('deposito', { ...base, operation_type: 'DEPOSIT_FIAT', timestamp: '2025-01-01T10:00:00Z', asset: 'EUR', amount: 100, amount_net: 100 });
    await tx('compra', { ...base, operation_type: 'BUY_FIAT', timestamp: '2025-01-02T10:00:00Z', asset: 'XRP', amount: 100, amount_net: 100, cost_asset: 'EUR', cost_amount: 50, price_per_unit: 0.5 });
    await tx('traspaso', { ...base, operation_type: 'TRANSFER_INTERNAL', timestamp: '2025-01-03T10:00:00Z', asset: 'XRP', amount: 40, amount_net: 40, destination_wallet_id: w2 });
    // Permuta XRP → ETH con su comisión en XRP en el mismo instante (se agrupa).
    await tx('permuta', { ...base, operation_type: 'BUY_CRYPTO', timestamp: '2025-01-04T10:00:00Z', asset: 'ETH', amount: 1, amount_net: 1, cost_asset: 'XRP', cost_amount: 20, price_per_unit: 20 });
    await tx('comision', { ...base, operation_type: 'FEE_EXCHANGE', timestamp: '2025-01-04T10:00:00Z', asset: 'XRP', amount: 2, amount_net: 2, fee_asset: 'XRP', fee_amount: 2 });
    // Venta de más de lo que hay en la wallet: hueco de 62.
    await tx('venta', { ...base, operation_type: 'SELL_FIAT', timestamp: '2025-01-05T10:00:00Z', asset: 'XRP', amount: 100, amount_net: 100, cost_asset: 'EUR', cost_amount: 50 });
    await tx('pendiente', { wallet_id: w2, manually_added: true, operation_type: 'WITHDRAW', timestamp: '2025-01-06T10:00:00Z', asset: 'XRP', amount: 5, amount_net: 5, destination_pending: true });

    runFifo = (await import('../../modules/fifo/engine')).runFifoEngine;
    await runFifo();
    const { default: router } = await import('./saldos');
    app = express();
    app.use('/api/v1/historial/saldos', router);
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  it('el motor guarda los déficits con su transacción, activo y cantidad', async () => {
    const rows = (await pool.query('SELECT transaction_id, asset, wallet_id, requested::float, missing::float FROM fifo_shortfalls')).rows;
    expect(rows).toEqual([{ transaction_id: ids.venta, asset: 'XRP', wallet_id: w1, requested: 100, missing: 62 }]);
  });

  it('saldo total tras cada operación: permuta, comisión agrupada, transferencia, hueco y retiro pendiente', async () => {
    const r = await saldos(`asset=XRP&ids=${all()}`);
    expect(byId(r.rows, 'compra')?.balance).toBe(100);
    expect(byId(r.rows, 'traspaso')?.balance).toBe(100); // interna: no cambia el total
    expect(byId(r.rows, 'permuta')?.balance).toBe(78);   // incluye su comisión agrupada
    expect(byId(r.rows, 'venta')).toEqual({ id: ids.venta, balance: 40, missing: 62 });
    expect(byId(r.rows, 'pendiente')?.balance).toBe(40); // destino pendiente: no mueve lotes
    expect(r.current).toBe(40);
    expect(r.shortfalls).toEqual({ count: 1, first_id: ids.venta });
  });

  it('sin agrupar, la permuta muestra su propio saldo y la comisión el suyo', async () => {
    const r = await saldos(`asset=XRP&group_fees=false&ids=${all()}`);
    expect(byId(r.rows, 'permuta')?.balance).toBe(80);
    expect(byId(r.rows, 'comision')?.balance).toBe(78);
  });

  it('por wallet: la transferencia interna mueve saldo entre wallets', async () => {
    const origen = await saldos(`asset=XRP&wallet_id=${w1}&ids=${all()}`);
    expect(byId(origen.rows, 'traspaso')?.balance).toBe(60);
    expect(origen.current).toBe(0);
    const destino = await saldos(`asset=XRP&wallet_id=${w2}&ids=${all()}`);
    expect(destino.current).toBe(40);
    expect(destino.shortfalls.count).toBe(0);
  });

  it('el saldo actual cuadra con los lotes abiertos (Portfolio)', async () => {
    const lots = (await pool.query(`SELECT SUM(quantity_remaining)::float AS q FROM fifo_lots WHERE asset = 'XRP'`)).rows[0].q;
    expect((await saldos('asset=XRP')).current).toBeCloseTo(lots, 9);
  });

  it('EUR con la definición común de movimientos', async () => {
    const r = await saldos(`asset=eur&ids=${ids.deposito},${ids.compra}`);
    expect(r.asset).toBe('EUR');
    expect(byId(r.rows, 'deposito')?.balance).toBe(100);
    expect(byId(r.rows, 'compra')?.balance).toBe(50);
  });

  it('solo devuelve las filas pedidas', async () => {
    const r = await saldos(`asset=XRP&ids=${ids.venta}`);
    expect(r.rows).toHaveLength(1);
  });

  it('los déficits se rehacen en cada ejecución del motor', async () => {
    await pool.query('UPDATE transactions SET amount = 38, amount_net = 38 WHERE id = $1', [ids.venta]);
    try {
      await runFifo();
      expect((await pool.query('SELECT count(*)::int AS n FROM fifo_shortfalls')).rows[0].n).toBe(0);
      expect((await saldos('asset=XRP')).shortfalls).toEqual({ count: 0, first_id: null });
    } finally {
      await pool.query('UPDATE transactions SET amount = 100, amount_net = 100 WHERE id = $1', [ids.venta]);
      await runFifo();
    }
  });

  it.each([
    ['sin activo', ''],
    ['activo con inyección', "asset=XRP' OR '1'='1"],
    ['wallet que no es UUID', 'asset=XRP&wallet_id=abc'],
    ['id que no es UUID', 'asset=XRP&ids=abc'],
    ['parámetro desconocido', 'asset=XRP&foo=1'],
  ])('%s → 400', async (_c, qs) => {
    const res = await request(app).get(`/api/v1/historial/saldos?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/syntax|postgres/i);
  });

  it('más de 200 ids → 400', async () => {
    const many = Array.from({ length: 201 }, () => ids.venta).join(',');
    expect((await request(app).get(`/api/v1/historial/saldos?asset=XRP&ids=${many}`)).status).toBe(400);
  });
});
