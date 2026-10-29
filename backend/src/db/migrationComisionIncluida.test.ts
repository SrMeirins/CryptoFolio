import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 017 (#415): comisión incluida en el coste, rellenada desde la
// fila original de las compras de Bitvavo. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/017_comision_incluida.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/017_comision_incluida.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const ids: Record<string, string> = {};

async function compra(key: string, exchange: string, fila: Record<string, string>, fee: string | null = null) {
  const w = (await pool.query(`INSERT INTO wallets (name, type) VALUES ($1, 'exchange') RETURNING id`, [`W ${key}`])).rows[0].id;
  const imp = (await pool.query(`INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('m.csv', $1, $2) RETURNING id`, [`h-${key}`, exchange])).rows[0].id;
  ids[key] = (await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, fee_asset, fee_amount, wallet_id, import_id)
     VALUES ('BUY', NOW(), 'SINT', 10, 10, 'EUR', 20.05, $1, $2, $3, $4) RETURNING id`, [fee, fee ? 0.01 : null, w, imp])).rows[0].id;
  await pool.query(
    `INSERT INTO raw_transactions (import_id, user_id, time, account, operation, coin, change, row_hash, transaction_id, original_row)
     VALUES ($1, '', NOW(), 'Bitvavo', 'BUY', 'SINT', 10, $2, $3, $4::jsonb)`, [imp, `rh-${key}`, ids[key], JSON.stringify(fila)]);
}
const fee = async (key: string) => (await pool.query(
  'SELECT included_fee_asset AS a, included_fee_amount::float AS n FROM transactions WHERE id = $1', [ids[key]])).rows[0];

describe('migración 017_comision_incluida', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    const fila = { Type: 'buy', 'Received / Paid Currency': 'EUR', 'Fee currency': 'EUR', 'Fee amount': '0.05' };
    await compra('ok', 'bitvavo', fila);
    await compra('otraMoneda', 'bitvavo', { ...fila, 'Fee currency': 'BNB' });
    await compra('binance', 'binance', fila);
    await compra('conFee', 'bitvavo', fila, 'EUR');
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('rellena solo las compras de Bitvavo con la comisión en la moneda de pago y sin comisión aparte', async () => {
    await pool.query(up);
    expect(await fee('ok')).toEqual({ a: 'EUR', n: 0.05 });
    for (const k of ['otraMoneda', 'binance', 'conFee']) expect(await fee(k)).toEqual({ a: null, n: null });
  });

  it('es idempotente y el CHECK exige activo e importe juntos', async () => {
    await pool.query(up);
    expect(await fee('ok')).toEqual({ a: 'EUR', n: 0.05 });
    await expect(pool.query(`UPDATE transactions SET included_fee_asset = 'EUR', included_fee_amount = NULL WHERE id = $1`, [ids.binance])).rejects.toThrow();
    await expect(pool.query(`UPDATE transactions SET included_fee_asset = 'EUR', included_fee_amount = 0 WHERE id = $1`, [ids.binance])).rejects.toThrow();
  });

  it('la reversión quita las columnas sin tocar el coste; volver a aplicarla las rellena', async () => {
    await pool.query(down);
    expect((await pool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'transactions' AND column_name LIKE 'included_fee_%'`)).rows[0].n).toBe(0);
    expect((await pool.query('SELECT cost_amount::float AS c FROM transactions WHERE id = $1', [ids.ok])).rows[0].c).toBe(20.05);
    await pool.query(up);
    expect(await fee('ok')).toEqual({ a: 'EUR', n: 0.05 });
  });
});
