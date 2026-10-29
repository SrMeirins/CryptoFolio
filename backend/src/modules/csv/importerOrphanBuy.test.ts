import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Compras con fiat sin su pago en el CSV (#435): compra con coste a revisar,
// nunca airdrop; al re-importar, las guardadas como airdrop pasan a compra.
// Datos sintéticos; sin red (#359).
beforeAll(() => { vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true'); });
afterAll(() => { vi.unstubAllEnvs(); });

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const HUERFANA = [HEADER, '1,2024-05-10 10:00:00,Spot,Buy Crypto With Fiat,SINT,1000,Ref - 111'].join('\n');
const CON_PAGO = [HEADER,
  '1,2024-05-11 10:00:00,Spot,Buy Crypto With Fiat,EUR,-20,Via CashBalance - Wallet/222',
  '1,2024-05-11 10:00:05,Spot,Buy Crypto With Fiat,OTRA,50,Via CashBalance - Wallet/222'].join('\n');

let testDb: TestDatabase;
let pool: Pool;
const tx = async (asset: string) => (await pool.query(
  `SELECT id, operation_type, cost_asset, cost_amount::float AS cost, notes FROM transactions WHERE asset = $1`, [asset])).rows[0];

describe('compra con fiat sin pago en el CSV (#435)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    process.env.DATABASE_URL = testDb.connectionString;
  }, 30000);
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('el parser la da como compra con EUR y coste a revisar; con su pago, compra normal', async () => {
    const { parseExchangeCsv } = await import('./exchanges');
    const [h] = (await parseExchangeCsv('binance', Buffer.from(HUERFANA))).transactions;
    expect(h).toMatchObject({ operationType: 'BUY', asset: 'SINT', costAsset: 'EUR', needsCostReview: true, orphanFiatBuy: true });
    const [p] = (await parseExchangeCsv('binance', Buffer.from(CON_PAGO))).transactions;
    expect(p).toMatchObject({ operationType: 'BUY', asset: 'OTRA', costAsset: 'EUR', costAmount: 20 });
    expect(p.orphanFiatBuy).toBeUndefined();
  });

  it('al importar, la vista previa pide su coste como compra y se guarda con el indicado', async () => {
    const { importCsvFile, previewCsvFile } = await import('./importer');
    const preview = await previewCsvFile(Buffer.from(HUERFANA));
    expect(preview.depositReviews).toHaveLength(1);
    expect(preview.depositReviews[0]).toMatchObject({ asset: 'SINT', kind: 'compra' });
    await importCsvFile(Buffer.from(HUERFANA), 'h.csv', {}, { [preview.depositReviews[0].txKey]: 0.03 });
    expect(await tx('SINT')).toMatchObject({ operation_type: 'BUY', cost_asset: 'EUR', cost: 30 });
  }, 30000);

  it('re-importar el mismo archivo pasa a compra la que estaba como airdrop, salvo si está editada', async () => {
    const { importCsvFile, previewCsvFile } = await import('./importer');
    // Como una importación anterior a #435: airdrop con su valor de mercado.
    await pool.query(`UPDATE transactions SET operation_type = 'AIRDROP', cost_asset = NULL, cost_amount = 25, price_per_unit = 0.025 WHERE asset = 'SINT'`);
    const preview = await previewCsvFile(Buffer.from(HUERFANA));
    expect(preview.depositReviews).toEqual([expect.objectContaining({ kind: 'compra', existingInDb: true, txKey: (await tx('SINT')).id })]);
    const r = await importCsvFile(Buffer.from(HUERFANA), 'h.csv');
    expect(r.orphanBuysReclassified).toBe(1);
    expect(await tx('SINT')).toMatchObject({ operation_type: 'BUY', cost_asset: 'EUR', cost: 25 });

    // Editada a mano: no se toca.
    await pool.query(`UPDATE transactions SET operation_type = 'AIRDROP', original_import = '{"amount": 1000}'::jsonb WHERE asset = 'SINT'`);
    await expect(importCsvFile(Buffer.from(HUERFANA), 'h.csv')).rejects.toThrow('Este CSV exacto ya fue importado');
    expect((await tx('SINT')).operation_type).toBe('AIRDROP');
  }, 30000);
});
