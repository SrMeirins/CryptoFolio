import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// GET /api/v1/transactions/:id/detalle (#373). Datos sintéticos: una compra
// que abre un lote, una venta y una transferencia que lo consumen, un staking
// (rendimiento), una transacción manual y filas de origen con user_id.
let testDb: TestDatabase;
let app: import('express').Express;
const ids: Record<string, string> = {};

describe('detalle de una transacción (#373)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    const { pool } = await import('../../db/client');
    const w = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Exchange', 'exchange') RETURNING id`)).rows[0].id;
    const w2 = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Fría', 'hardware') RETURNING id`)).rows[0].id;
    const net = (await pool.query(
      `INSERT INTO networks (name, native_asset, explorer_url, explorer_tx_url) VALUES ('Red de prueba', 'XRP', 'https://explorer.test/address/{address}', 'https://explorer.test/tx/{tx_hash}') RETURNING id`)).rows[0].id;
    const imp = (await pool.query(`INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('sintetico.csv', 'h-373', 'binance') RETURNING id`)).rows[0].id;
    const tx = async (key: string, f: Record<string, unknown>) => {
      const cols = Object.keys(f);
      ids[key] = (await pool.query(`INSERT INTO transactions (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, Object.values(f))).rows[0].id;
    };
    await tx('buy', { operation_type: 'BUY', timestamp: '2024-01-10T10:00:00Z', asset: 'XRP', amount: 100, amount_net: 100, cost_asset: 'EUR', cost_amount: 50, wallet_id: w, import_id: imp });
    await tx('sell', { operation_type: 'SELL', timestamp: '2025-03-01T10:00:00Z', asset: 'XRP', amount: 40, amount_net: 40, cost_asset: 'EUR', cost_amount: 30, wallet_id: w });
    await tx('transfer', { operation_type: 'WITHDRAW', timestamp: '2025-04-01T10:00:00Z', asset: 'XRP', amount: 10, amount_net: 10, wallet_id: w,
      destination_wallet_id: w2, tx_hash: 'ABCDEF', counterparty_address: 'rDireccionSintetica', counterparty_network_id: net });
    await tx('staking', { operation_type: 'STAKING_REWARD', timestamp: '2025-12-31T23:30:00Z', asset: 'XRP', amount: 1, amount_net: 1, price_per_unit: 0.5, wallet_id: w });
    await tx('manual', { operation_type: 'BUY', timestamp: '2025-05-01T10:00:00Z', asset: 'BTC', amount: 0.1, amount_net: 0.1, cost_asset: 'EUR', cost_amount: 5000, wallet_id: w, manually_added: true });

    const lot = (await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, fee_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('XRP', 100, 50, 25, 0.5, 0, $1, '2024-01-10T10:00:00Z', $2) RETURNING id`, [ids.buy, w])).rows[0].id;
    await pool.query(`INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
       VALUES ($1, $2, 40, 20, 30, 10, 'GAIN', '2025-03-01T10:00:00Z'), ($1, $3, 10, 5, 5, 0, 'NONE', '2025-04-01T10:00:00Z')`, [lot, ids.sell, ids.transfer]);
    for (let i = 0; i < 3; i++) {
      await pool.query(`INSERT INTO raw_transactions (import_id, user_id, time, account, operation, coin, change, remark, row_hash, transaction_id)
        VALUES ($1, '987654321', '2024-01-10T10:00:00Z', 'Spot', 'Buy', 'XRP', 33.3, $2, $3, $4)`, [imp, i === 0 ? '<b>nota</b>' : null, `rh-373-${i}`, ids.buy]);
    }

    const { default: router } = await import('./transactionDetail');
    app = express();
    app.use('/api/v1/transactions', router);
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  const detalle = async (key: string) => (await request(app).get(`/api/v1/transactions/${ids[key]}/detalle`)).body;

  it('venta: de qué compra salen sus unidades, con coste, proceeds y ganancia; año fiscal', async () => {
    const d = await detalle('sell');
    expect(d.transaction.id).toBe(ids.sell);
    expect(d.fifo.consumed).toHaveLength(1);
    expect(d.fifo.consumed[0]).toMatchObject({ origin: { id: ids.buy, operation_type: 'BUY' }, quantity: 40, cost_eur: 20, proceeds_eur: 30, gain_loss_eur: 10, fiscal_event_type: 'GAIN' });
    expect(d.fifo.totals).toEqual({ cost_eur: 20, proceeds_eur: 30, gain_loss_eur: 10 });
    expect(d.fiscal_years).toEqual([2025]);
  });

  it('compra: el lote que abre, lo que queda y quién lo consumió', async () => {
    const d = await detalle('buy');
    expect(d.fifo.opened).toHaveLength(1);
    expect(d.fifo.opened[0]).toMatchObject({ asset: 'XRP', quantity_original: 100, quantity_remaining: 50 });
    expect(d.fifo.opened[0].consumed_by.map((c: { transaction_id: string }) => c.transaction_id)).toEqual([ids.sell, ids.transfer]);
    expect(d.fiscal_years).toEqual([]);
  });

  it('origen: archivo y número de filas que agrupa, nunca el user_id ni el contenido de las filas', async () => {
    const d = await detalle('buy');
    expect(d.origin).toEqual({ import: expect.objectContaining({ filename: 'sintetico.csv', exchange: 'binance' }), source_rows: 3 });
    expect(JSON.stringify(d)).not.toContain('987654321');
    expect(JSON.stringify(d)).not.toContain('<b>nota</b>');
  });

  it('transferencia: consumo sin efecto fiscal y enlaces al explorador de su red', async () => {
    const d = await detalle('transfer');
    expect(d.fifo.consumed[0].fiscal_event_type).toBe('NONE');
    expect(d.fifo.totals.gain_loss_eur).toBe(0);
    expect(d.fiscal_years).toEqual([]);
    expect(d.onchain).toEqual({
      tx_hash: 'ABCDEF', address: 'rDireccionSintetica', network: 'Red de prueba',
      tx_url: 'https://explorer.test/tx/ABCDEF', address_url: 'https://explorer.test/address/rDireccionSintetica',
    });
  });

  it('rendimiento: su año fiscal en hora local (31/12 23:30Z ya es 2026 en Madrid)', async () => {
    expect((await detalle('staking')).fiscal_years).toEqual([2026]);
  });

  it('manual: sin origen ni datos on-chain', async () => {
    const d = await detalle('manual');
    expect(d.origin).toEqual({ import: null, source_rows: 0 });
    expect(d.onchain.tx_url).toBeNull();
  });

  it('400 si el id no es UUID; 404 si no existe', async () => {
    expect((await request(app).get('/api/v1/transactions/abc/detalle')).status).toBe(400);
    expect((await request(app).get("/api/v1/transactions/1'%20OR%20'1'='1/detalle")).status).toBe(400);
    expect((await request(app).get('/api/v1/transactions/7f3a1c2e-1b2c-4d5e-8f90-123456789abc/detalle')).status).toBe(404);
  });
});
