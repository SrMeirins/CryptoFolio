import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Comisiones agrupadas con su compra o venta (#371). Datos sintéticos: cada
// caso de la regla de emparejamiento en un instante distinto.
let testDb: TestDatabase;
let app: import('express').Express;
const ids: Record<string, string> = {};

describe('comisiones agrupadas (#371)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    const { pool } = await import('../../db/client');
    const wa = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('A', 'exchange') RETURNING id`)).rows[0].id;
    const wb = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('B', 'exchange') RETURNING id`)).rows[0].id;
    const tx = async (key: string, op: string, ts: string, asset: string, amount: number, wallet = wa, cost?: [string, number]) => {
      ids[key] = (await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
         VALUES ($1::operation_type, $2, $3, $4, $4, $5, $6, $7) RETURNING id`,
        [op, ts, asset, amount, cost?.[0] ?? null, cost?.[1] ?? null, wallet])).rows[0].id;
    };
    // 1. Venta con dos comisiones en el mismo instante (dos fills).
    await tx('sell', 'SELL', '2025-01-01T10:00:00Z', 'XRP', 100, wa, ['EUR', 50]);
    await tx('feeSell1', 'FEE_EXCHANGE', '2025-01-01T10:00:00Z', 'BNB', 0.01);
    await tx('feeSell2', 'FEE_EXCHANGE', '2025-01-01T10:00:00Z', 'EUR', 0.05);
    // 2. Dos compras en el mismo instante: la comisión en ETH va a la de ETH; la de BNB es ambigua.
    await tx('buyEth', 'BUY', '2025-01-02T10:00:00Z', 'ETH', 1, wa, ['USDT', 2000]);
    await tx('buyXrp', 'BUY', '2025-01-02T10:00:00Z', 'XRP', 50, wa, ['EUR', 20]);
    await tx('feeEth', 'FEE_EXCHANGE', '2025-01-02T10:00:00Z', 'ETH', 0.001);
    await tx('feeAmbigua', 'FEE_EXCHANGE', '2025-01-02T10:00:00Z', 'BNB', 0.01);
    // 3. Junto a un préstamo de margen: suelta.
    await tx('borrow', 'MARGIN_BORROW', '2025-01-03T10:00:00Z', 'USDT', 100);
    await tx('feeMargen', 'FEE_EXCHANGE', '2025-01-03T10:00:00Z', 'USDT', 0.1);
    // 4. Sin operación, y 5. mismo instante pero otra wallet: sueltas.
    await tx('feeSola', 'FEE_EXCHANGE', '2025-01-04T10:00:00Z', 'BNB', 0.02);
    await tx('feeOtraWallet', 'FEE_EXCHANGE', '2025-01-01T10:00:00Z', 'BNB', 0.03, wb);

    const { default: router } = await import('./index');
    app = express();
    app.use('/api/transactions', router);
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  const list = async (qs = '') => (await request(app).get(`/api/transactions?limit=200${qs}`)).body;
  const idsOf = (rows: { id: string }[]) => rows.map(r => r.id);
  const k = (...keys: string[]) => keys.map(x => ids[x]);

  it('agrupa por defecto: las comisiones emparejadas no son filas propias', async () => {
    const body = await list();
    expect(body.grouped_fees).toBe(true);
    const visibles = idsOf(body.transactions);
    for (const key of ['feeSell1', 'feeSell2', 'feeEth']) expect(visibles).not.toContain(ids[key]);
    for (const key of ['feeAmbigua', 'feeMargen', 'feeSola', 'feeOtraWallet']) expect(visibles).toContain(ids[key]);
    expect(body.total).toBe(11 - 3);
  });

  it('la operación trae sus comisiones con valor y origen', async () => {
    const rows = (await list()).transactions as { id: string; grouped_fees: { id: string; asset: string; value_source: string }[] }[];
    const sell = rows.find(r => r.id === ids.sell)!;
    expect(sell.grouped_fees.map(f => f.id).sort()).toEqual(k('feeSell1', 'feeSell2').sort());
    expect(sell.grouped_fees.find(f => f.id === ids.feeSell2)).toMatchObject({ asset: 'EUR', value_source: 'coste' });
    expect(rows.find(r => r.id === ids.buyEth)!.grouped_fees.map(f => f.id)).toEqual(k('feeEth'));
    expect(rows.find(r => r.id === ids.buyXrp)!.grouped_fees).toEqual([]);
  });

  it('una comisión suelta indica su operación (fee_parent_id) si la tiene', async () => {
    const rows = (await list('&asset=EUR')).transactions as { id: string; fee_parent_id: string | null }[];
    // La venta (XRP) queda fuera del filtro: su comisión en EUR se ve suelta.
    expect(rows.find(r => r.id === ids.feeSell2)?.fee_parent_id).toBe(ids.sell);
  });

  it('con group_fees=false o filtrando por tipo de comisión, todas son filas', async () => {
    const sueltas = await list('&group_fees=false');
    expect(sueltas.total).toBe(11);
    expect(sueltas.grouped_fees).toBe(false);
    expect((await list('&type=FEE_EXCHANGE')).total).toBe(7);
  });

  it('filtrando por tipo de operación, la venta sigue trayendo sus comisiones', async () => {
    const rows = (await list('&type=SELL')).transactions as { id: string; grouped_fees: unknown[] }[];
    expect(rows.map(r => r.id)).toEqual(k('sell'));
    expect(rows[0].grouped_fees).toHaveLength(2);
  });

  it('los flujos no cambian al agrupar', async () => {
    expect((await list()).flows).toEqual((await list('&group_fees=false')).flows);
  });

  it('el CSV trae todas las filas y la operación asociada de cada comisión', async () => {
    const res = await request(app).get('/api/transactions/export.csv').buffer(true)
      .parse((r, cb) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c: string) => { d += c; }); r.on('end', () => cb(null, d)); });
    const lines = (res.body as string).replace(/^\uFEFF/, '').trimEnd().split('\n');
    expect(lines[0].endsWith(';Operación asociada')).toBe(true);
    expect(lines).toHaveLength(1 + 11);
    const fila = lines.find(l => l.split(';')[20] === ids.feeEth)!;
    expect(fila.split(';').at(-1)).toBe(ids.buyEth);
  });

  it('group_fees inválido → 400', async () => {
    expect((await request(app).get('/api/transactions?group_fees=si')).status).toBe(400);
  });
});
