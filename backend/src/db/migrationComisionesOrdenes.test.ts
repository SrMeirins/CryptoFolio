import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 022 (#543): las comisiones sueltas de una venta de Binance pasan a
// la venta (la moneda principal) o quedan enlazadas a ella (otras monedas), y
// las de compras en otra moneda se enlazan a su compra. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/022_comisiones_ordenes_binance.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/022_comisiones_ordenes_binance.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
let walletId: string;
let importId: string;
const ids: Record<string, string> = {};

const T1 = '2024-05-10T10:00:00Z';
const T2 = '2024-05-11T10:00:00Z';
const T3 = '2024-05-12T10:00:00Z';
const T4 = '2024-05-13T10:00:00Z';
const T5 = '2024-05-14T10:00:00Z';

async function tx(clave: string, op: string, ts: string, asset: string, amount: number, extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  ids[clave] = id;
  await pool.query(
    `INSERT INTO transactions (id, import_id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount,
       wallet_id, account, notes, original_import)
     VALUES ($1, $2, $3::operation_type, $4, $5, $6, $6, $7, $8, $9, 'Spot', $10, $11::jsonb)`,
    [id, importId, op, ts, asset, amount, extra.cost_asset ?? null, extra.cost_amount ?? null, walletId,
     extra.notes ?? null, extra.original_import ?? null]);
  return id;
}

/** Fila en bruto con su línea original del CSV. */
async function bruto(clave: string, txClave: string, ts: string, operacion: string, coin: string, change: number) {
  await pool.query(
    `INSERT INTO raw_transactions (import_id, user_id, time, account, operation, coin, change, row_hash, transaction_id, original_row)
     VALUES ($1, '', $2, 'Spot', 'X', $3, $4, $5, $6, $7::jsonb)`,
    [importId, ts, coin, Math.abs(change), `h-${clave}`, ids[txClave],
     JSON.stringify({ Operation: operacion, Coin: coin, Change: String(change), Account: 'Spot' })]);
}

/** Venta con sus filas de venta y contrapartida, sin comisión. */
async function venta(clave: string, ts: string, extra: Record<string, unknown> = {}) {
  await tx(clave, 'SELL', ts, 'SINT', 10, { cost_asset: 'USDT', cost_amount: 100, ...extra });
  await bruto(`${clave}-s`, clave, ts, 'Transaction Sold', 'SINT', -10);
  await bruto(`${clave}-r`, clave, ts, 'Transaction Revenue', 'USDT', 100);
}

async function suelta(clave: string, ts: string, coin: string, amount: number) {
  await tx(clave, 'FEE_EXCHANGE', ts, coin, amount, { notes: 'Standalone Transaction Fee' });
  await bruto(clave, clave, ts, 'Transaction Fee', coin, -amount);
}

const fila = async (id: string) => (await pool.query(
  `SELECT operation_type::text AS op, asset, amount::float AS amount, fee_asset, fee_amount::float AS fee, linked_tx_id, notes
   FROM transactions WHERE id = $1`, [id])).rows[0];
const brutoDe = async (clave: string) => (await pool.query(
  `SELECT transaction_id FROM raw_transactions WHERE row_hash = $1`, [`h-${clave}`])).rows[0].transaction_id as string;
const sueltasEn = async (ts: string) => (await pool.query(
  `SELECT asset, amount::float AS amount FROM transactions
   WHERE operation_type = 'FEE_EXCHANGE' AND notes = 'Standalone Transaction Fee' AND timestamp = $1 ORDER BY asset, amount`, [ts])).rows;

describe('migración 022_comisiones_ordenes_binance', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
    importId = (await pool.query(`INSERT INTO csv_imports (filename, file_hash) VALUES ('s.csv', 'h') RETURNING id`)).rows[0].id;

    // T1: venta con dos comisiones en USDT y dos en BNB.
    await venta('v1', T1);
    await suelta('f1', T1, 'USDT', 0.1);
    await suelta('f2', T1, 'USDT', 0.2);
    await suelta('f3', T1, 'BNB', 0.01);
    await suelta('f4', T1, 'BNB', 0.02);
    // T2: venta con comisión solo en BNB.
    await venta('v2', T2);
    await suelta('f5', T2, 'BNB', 0.01);
    // T3: instante ambiguo (venta y compra a la vez): no se toca.
    await venta('v3', T3);
    await tx('c3', 'BUY', T3, 'XYZ', 5, { cost_asset: 'USDT', cost_amount: 50 });
    await suelta('f6', T3, 'USDT', 0.1);
    // T4: venta editada a mano (#378): no se toca.
    await venta('v4', T4, { original_import: '{"amount": 10}' });
    await suelta('f7', T4, 'USDT', 0.1);
    // T5: compra con comisión en BNB aparte.
    await tx('c5', 'BUY', T5, 'XYZ', 5, { cost_asset: 'USDT', cost_amount: 50 });
    await tx('f8', 'FEE_EXCHANGE', T5, 'BNB', 0.01, { notes: 'Fee en BNB para BUY XYZ' });

    // FIFO: un lote abierto por f4 (sintético) que consume otra operación, y un consumo de f1.
    const otra = await tx('otra', 'SELL', '2024-06-01T00:00:00Z', 'BNB', 0.02, { cost_asset: 'EUR', cost_amount: 10 });
    const lote = (await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('BNB', 1, 0.98, 500, 500, $1, $2, $3) RETURNING id`, [ids.f4, T1, walletId])).rows[0].id;
    for (const [consume, q] of [[otra, 0.02], [ids.f1, 0]] as const) {
      await pool.query(
        `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
         VALUES ($1, $2, $3, 0, 0, 0, 'NONE', $4)`, [lote, consume, q, T1]);
    }
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('integra las comisiones en su venta, enlaza las de otra moneda y es idempotente', async () => {
    await pool.query(up);
    await pool.query(up);

    expect(await fila(ids.v1)).toMatchObject({ fee_asset: 'USDT', linked_tx_id: null });
    expect((await fila(ids.v1)).fee).toBeCloseTo(0.3, 12);
    // BNB: una sola fila (la primera) con el total, enlazada a la venta.
    const bnb = await pool.query(`SELECT id FROM transactions WHERE operation_type = 'FEE_EXCHANGE' AND timestamp = $1`, [T1]);
    expect(bnb.rows).toHaveLength(1);
    const conserva = bnb.rows[0].id as string;
    const f = await fila(conserva);
    expect(f).toMatchObject({ asset: 'BNB', linked_tx_id: ids.v1, notes: 'Fee en BNB para SELL SINT' });
    expect(f.amount).toBeCloseTo(0.03, 12);
    // Cada fila en bruto apunta a la transacción que la conserva.
    expect(await brutoDe('f1')).toBe(ids.v1);
    expect(await brutoDe('f2')).toBe(ids.v1);
    expect(await brutoDe('f3')).toBe(conserva);
    expect(await brutoDe('f4')).toBe(conserva);

    // Solo BNB: va en la propia venta.
    expect(await fila(ids.v2)).toMatchObject({ fee_asset: 'BNB', fee: 0.01 });
    expect(await sueltasEn(T2)).toEqual([]);

    // Ambiguo y editado: intactos.
    expect((await fila(ids.v3)).fee_asset).toBeNull();
    expect(await sueltasEn(T3)).toEqual([{ asset: 'USDT', amount: 0.1 }]);
    expect((await fila(ids.v4)).fee_asset).toBeNull();
    expect(await sueltasEn(T4)).toEqual([{ asset: 'USDT', amount: 0.1 }]);

    // Compra: comisión en BNB enlazada.
    expect((await fila(ids.f8)).linked_tx_id).toBe(ids.c5);
  });

  it('las referencias del FIFO pasan a la transacción que absorbe la comisión', async () => {
    const conserva = (await pool.query(
      `SELECT id FROM transactions WHERE operation_type = 'FEE_EXCHANGE' AND timestamp = $1`, [T1])).rows[0].id;
    const lote = (await pool.query(`SELECT open_transaction_id FROM fifo_lots`)).rows[0];
    expect([ids.f4, conserva]).toContain(lote.open_transaction_id);
    const consumos = (await pool.query(`SELECT consuming_transaction_id AS t FROM fifo_lot_consumptions ORDER BY quantity_consumed`)).rows.map(r => r.t);
    expect(consumos).toEqual([ids.v1, ids.otra]);
  });

  it('la reversión rehace las comisiones sueltas desde las filas originales', async () => {
    await pool.query(down);
    expect((await fila(ids.v1)).fee_asset).toBeNull();
    expect(await sueltasEn(T1)).toEqual([
      { asset: 'BNB', amount: 0.01 }, { asset: 'BNB', amount: 0.02 },
      { asset: 'USDT', amount: 0.1 }, { asset: 'USDT', amount: 0.2 },
    ]);
    expect(await sueltasEn(T2)).toEqual([{ asset: 'BNB', amount: 0.01 }]);
    expect((await fila(ids.v2)).fee_asset).toBeNull();
    expect((await fila(ids.f8)).linked_tx_id).toBeNull();
    // Ninguna fila en bruto queda sin transacción.
    const huerfanas = await pool.query(
      `SELECT count(*)::int AS n FROM raw_transactions WHERE transaction_id IS NULL OR transaction_id NOT IN (SELECT id FROM transactions)`);
    expect(huerfanas.rows[0].n).toBe(0);
  });
});
