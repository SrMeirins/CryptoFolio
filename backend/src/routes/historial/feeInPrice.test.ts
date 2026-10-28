import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Comisión incluida en el precio (#431): se reconoce por la operación de la
// fila original del CSV y solo en compras y ventas sin otra comisión. No
// cambia ninguna cifra. Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
const ids: Record<string, string> = {};

describe('comisión incluida en el precio (#431)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = (await import('../../db/client')).pool;
    const w = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Spot test', 'exchange') RETURNING id`)).rows[0].id;
    const imp = (await pool.query(`INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('s.csv', 'h-431', 'binance') RETURNING id`)).rows[0].id;
    let n = 0;
    const tx = async (key: string, operation: string, f: Record<string, unknown>) => {
      const row = { operation_type: 'BUY', timestamp: '2025-03-01T10:00:00Z', asset: 'SINT', amount: 1, amount_net: 1, wallet_id: w, account: 'Spot', import_id: imp, ...f };
      const cols = Object.keys(row);
      ids[key] = (await pool.query(`INSERT INTO transactions (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, Object.values(row))).rows[0].id;
      await pool.query(
        `INSERT INTO raw_transactions (import_id, user_id, time, account, operation, coin, change, row_hash, transaction_id, original_row)
         VALUES ($1, '', NOW(), 'Spot', 'BUY', 'SINT', 1, $2, $3, $4::jsonb)`,
        [imp, `rh-431-${n++}`, ids[key], JSON.stringify({ Operation: operation, Coin: 'SINT', Change: '1' })]);
    };
    await tx('convert', 'Binance Convert', { cost_asset: 'EUR', cost_amount: 10 });
    await tx('tarjeta', 'Buy Crypto With Card', { cost_asset: 'EUR', cost_amount: 10 });
    await tx('spot', 'Transaction Buy', { cost_asset: 'EUR', cost_amount: 10 });
    await tx('conFee', 'Binance Convert', { cost_asset: 'EUR', cost_amount: 10, fee_asset: 'EUR', fee_amount: 0.1 });
    await tx('airdrop', 'Buy Crypto With Fiat', { operation_type: 'AIRDROP' });

    const { default: list } = await import('../transactions/index');
    const { default: stats } = await import('./estadisticas');
    app = express();
    app.use('/api/transactions', list);
    app.use('/api/v1/historial/estadisticas', stats);
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  it('marca solo compras y ventas de esos tipos sin otra comisión', async () => {
    const { transactions } = (await request(app).get('/api/transactions?limit=50')).body;
    const by = Object.fromEntries(transactions.map((t: { id: string; fee_in_price: string | null }) => [t.id, t.fee_in_price]));
    expect(by[ids.convert]).toBe('Binance Convert');
    expect(by[ids.tarjeta]).toBe('Buy Crypto With Card');
    expect(by[ids.spot]).toBeNull();
    expect(by[ids.conFee]).toBeNull();
    expect(by[ids.airdrop]).toBeNull();
  });

  it('el resumen las cuenta aparte y no cambia las comisiones', async () => {
    const { totals } = (await request(app).get('/api/v1/historial/estadisticas')).body;
    expect(totals.fees_in_price_ops).toBe(2);
    expect(totals.fee_ops).toBe(1);
  });
});
