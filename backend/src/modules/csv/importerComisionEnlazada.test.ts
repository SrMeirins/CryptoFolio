import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Comisiones de una orden en dos monedas (#543): al importar, la venta guarda
// la del par y la de BNB queda como FEE_EXCHANGE enlazada a ella. Cada fila en
// bruto apunta a su transacción. Datos sintéticos; sin red (#359).
beforeAll(() => { vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true'); });
afterAll(() => { vi.unstubAllEnvs(); });

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const T = '2024-05-10 10:00:00';
const VENTA = [HEADER,
  `1,${T},Spot,Transaction Sold,SINT,-10,`,
  `1,${T},Spot,Transaction Revenue,USDT,100,`,
  `1,${T},Spot,Transaction Fee,USDT,-0.1,`,
  `1,${T},Spot,Transaction Fee,BNB,-0.01,`,
].join('\n');

let testDb: TestDatabase;
let pool: Pool;

describe('importar una venta con comisión en dos monedas (#543)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    process.env.DATABASE_URL = testDb.connectionString;
  }, 30000);
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('enlaza la comisión en BNB a su venta y reparte las filas en bruto', async () => {
    const { importCsvFile } = await import('./importer');
    await importCsvFile(Buffer.from(VENTA), 'v.csv');
    const txs = (await pool.query(
      `SELECT id, operation_type::text AS op, asset, fee_asset, fee_amount::float AS fee, linked_tx_id FROM transactions ORDER BY operation_type`)).rows;
    const venta = txs.find(t => t.op === 'SELL');
    const fee = txs.find(t => t.op === 'FEE_EXCHANGE');
    expect(txs).toHaveLength(2);
    expect(venta).toMatchObject({ asset: 'SINT', fee_asset: 'USDT', fee: 0.1, linked_tx_id: null });
    expect(fee).toMatchObject({ asset: 'BNB', linked_tx_id: venta.id });

    const filas = (await pool.query(
      `SELECT original_row->>'Coin' AS coin, original_row->>'Operation' AS op, transaction_id FROM raw_transactions`)).rows;
    expect(filas).toHaveLength(4);
    for (const f of filas) {
      expect(f.transaction_id).toBe(f.coin === 'BNB' ? fee.id : venta.id);
    }
  }, 30000);
});
