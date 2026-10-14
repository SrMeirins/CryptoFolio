import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Importes en USD en la API (#175): cada importe en EUR se convierte con el
// tipo USD por EUR de su fecha (1 / precio de USDT en price_cache).
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('API — moneda de visualización USD (#175)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const spot = (await pool.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;

    // 1 USDT = 0,80 € el 1 de enero (1,25 $/€) y 0,50 € el 10 (2 $/€).
    await pool.query(`INSERT INTO price_cache (asset, price_eur, price_date) VALUES ('USDT', 0.8, '2026-01-01'), ('USDT', 0.5, '2026-01-10')`);

    const insert = async (op: string, ts: string, asset: string, amount: number, cost: [string, number] | null) =>
      (await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
         VALUES ($1::operation_type, $2, $3, $4, $4, $5, $6, $7) RETURNING id`,
        [op, ts, asset, amount, cost?.[0] ?? null, cost?.[1] ?? null, spot],
      )).rows[0].id as string;
    await insert('DEPOSIT_FIAT', '2026-01-01T10:00:00Z', 'EUR', 100, null);          // 100 € → 125 $
    const buy = await insert('BUY', '2026-01-02T10:00:00Z', 'XRP', 50, ['EUR', 40]); // fecha sin tipo exacto → la más cercana (1 de enero)
    await insert('DEPOSIT_FIAT', '2026-01-10T10:00:00Z', 'EUR', 10, null);           // 10 € → 20 $

    await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, fee_eur, open_transaction_id, opened_at, wallet_id, usd_per_eur)
       VALUES ('XRP', 50, 50, 40, 0.8, 0, $1, '2026-01-02T10:00:00Z', $2, 1.25)`,
      [buy, spot],
    );

    const { default: fifoRouter } = await import('./fifo');
    const { default: txRouter } = await import('./transactions');
    app = express();
    app.use('/api/fifo', fifoRouter);
    app.use('/api/transactions', txRouter);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('GET /fifo/lots incluye coste y precio medio en USD', async () => {
    const res = await request(app).get('/api/fifo/lots');
    expect(Number(res.body[0].cost_basis_usd)).toBeCloseTo(50, 6);
    expect(Number(res.body[0].avg_price_usd)).toBeCloseTo(1, 6);
  });

  it('GET /fifo/lots: si algún lote del grupo no tiene tipo USD, el coste en USD es nulo (#182)', async () => {
    const spot = (await pool.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
    const tx = (await pool.query(`SELECT id FROM transactions WHERE asset = 'XRP' LIMIT 1`)).rows[0].id;
    await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, fee_eur, open_transaction_id, opened_at, wallet_id, usd_per_eur)
       VALUES ('ADA', 10, 10, 10, 1, 0, $1, '2026-01-02T10:00:00Z', $2, 1.25),
              ('ADA', 10, 10, 20, 2, 0, $1, '2026-01-03T10:00:00Z', $2, NULL)`,
      [tx, spot],
    );
    try {
      const res = await request(app).get('/api/fifo/lots');
      const ada = res.body.find((l: { asset: string }) => l.asset === 'ADA');
      expect(Number(ada.cost_basis_eur)).toBeCloseTo(30, 6);
      // Antes: 12,5 $ (solo el lote con tipo), un coste incompleto sin aviso.
      expect(ada.cost_basis_usd).toBeNull();
      expect(ada.avg_price_usd).toBeNull();
      // Los grupos con tipo en todos sus lotes no cambian.
      const xrp = res.body.find((l: { asset: string }) => l.asset === 'XRP');
      expect(Number(xrp.cost_basis_usd)).toBeCloseTo(50, 6);
    } finally {
      await pool.query(`DELETE FROM fifo_lots WHERE asset = 'ADA'`);
    }
  });

  it('GET /fifo/eur-flow?currency=USD convierte cada movimiento con el tipo de su fecha', async () => {
    const eur = await request(app).get('/api/fifo/eur-flow');
    const usd = await request(app).get('/api/fifo/eur-flow?currency=USD');
    expect(eur.body).toMatchObject({ currency: 'EUR', deposited: 110 });
    expect(usd.body.currency).toBe('USD');
    expect(usd.body.deposited).toBeCloseTo(145, 6);        // 125 + 20
    expect(usd.body.eurSpentBuying).toBeCloseTo(50, 6);    // 40 € × 1,25 (fecha más cercana)
  });

  it('GET /transactions incluye el tipo de cada fila y el total en la moneda pedida', async () => {
    const res = await request(app).get('/api/transactions?currency=USD');
    const rate = Object.fromEntries(res.body.transactions.map((t: { timestamp: string; usd_per_eur: string }) =>
      [new Date(t.timestamp).toISOString().slice(0, 10), Number(t.usd_per_eur)]));
    expect(rate['2026-01-01']).toBeCloseTo(1.25, 6);
    expect(rate['2026-01-10']).toBeCloseTo(2, 6);
    expect(res.body.currency).toBe('USD');
    expect(res.body.total_eur).toBeCloseTo(40, 6);
    expect(res.body.total_amount).toBeCloseTo(50, 6);
  });

  it('GET /transactions/stats?currency=USD convierte lo invertido', async () => {
    const res = await request(app).get('/api/transactions/stats?currency=USD');
    expect(res.body.currency).toBe('USD');
    expect(Number(res.body.totals.total_invested)).toBeCloseTo(50, 6);
  });

  it.each(['/api/fifo/eur-flow', '/api/transactions', '/api/transactions/stats'])('%s rechaza una moneda no soportada', async (path) => {
    const res = await request(app).get(`${path}?currency=GBP`);
    expect(res.status).toBe(400);
  });
});
