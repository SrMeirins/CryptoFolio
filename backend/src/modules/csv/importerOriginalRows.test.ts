import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// #374: cada hash de raw_transactions guarda su fila original del CSV, sin el
// «User ID». Re-importar el mismo archivo completa las filas de importaciones
// anteriores. Datos sintéticos; sin red (#359).
beforeAll(() => { vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true'); });
afterAll(() => { vi.unstubAllEnvs(); });

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const BITVAVO = 'Timezone,Date,Time,Type,Currency,Amount,Quote Currency,Quote Price,Received / Paid Currency,Received / Paid Amount,Fee currency,Fee amount,Status,Transaction ID,Address';
// Una orden con dos fills parciales de importes distintos, en el mismo segundo.
const ORDEN = [
  HEADER,
  '999,2024-03-01 10:00:00,Spot,Transaction Buy,XRP,40,<b>fill</b>',
  '999,2024-03-01 10:00:00,Spot,Transaction Spend,USDC,-20,',
  '999,2024-03-01 10:00:00,Spot,Transaction Buy,XRP,60,',
  '999,2024-03-01 10:00:00,Spot,Transaction Spend,USDC,-30,',
].join('\n');

let testDb: TestDatabase;
let pool: Pool;
type Fila = { original_row: Record<string, string> | null; transaction_id: string };
const filas = async (): Promise<Fila[]> => (await pool.query(
  `SELECT original_row, transaction_id FROM raw_transactions ORDER BY original_row->>'Coin', original_row->>'Change'`,
)).rows;

describe('importCsvFile — filas originales del CSV (#374)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    process.env.DATABASE_URL = testDb.connectionString;
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('cada fill parcial conserva su fila con su propio importe, sin User ID', async () => {
    const { importCsvFile } = await import('./importer');
    const r = await importCsvFile(Buffer.from(ORDEN), 'orden.csv');
    expect(r.newTransactions).toBe(1);
    expect(r.originalRowsCompleted).toBe(0);

    const rows = await filas();
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map(f => f.transaction_id)).size).toBe(1);
    expect(rows.map(f => [f.original_row?.Coin, f.original_row?.Change])).toEqual([
      ['USDC', '-20'], ['USDC', '-30'], ['XRP', '40'], ['XRP', '60'],
    ]);
    // El texto del comentario se guarda tal cual (se pinta como texto, no HTML).
    expect(rows.find(f => f.original_row?.Change === '40')?.original_row?.Remark).toBe('<b>fill</b>');
    for (const f of rows) expect(f.original_row).not.toHaveProperty('User ID');
  });

  it('la base de datos rechaza una fila original con User ID', async () => {
    await expect(pool.query(
      `UPDATE raw_transactions SET original_row = '{"User ID": "1"}'::jsonb WHERE original_row->>'Change' = '40'`,
    )).rejects.toThrow(/chk_raw_transactions_original_row/);
  });

  it('el mismo archivo completa las filas de una importación anterior sin crear transacciones', async () => {
    const { importCsvFile, previewCsvFile } = await import('./importer');
    // Como una importación anterior a #374: hashes sin fila original.
    await pool.query('UPDATE raw_transactions SET original_row = NULL');
    // La vista previa avisa de cuántas puede completar.
    expect((await previewCsvFile(Buffer.from(ORDEN))).originalRowsMissing).toBe(4);
    const txAntes = (await pool.query('SELECT count(*)::int AS n FROM transactions')).rows[0].n;

    const r = await importCsvFile(Buffer.from(ORDEN), 'orden.csv');
    expect(r).toMatchObject({ newTransactions: 0, originalRowsCompleted: 4 });
    expect((await pool.query('SELECT count(*)::int AS n FROM transactions')).rows[0].n).toBe(txAntes);
    expect((await filas()).every(f => f.original_row !== null)).toBe(true);
  });

  it('con todo completo, el mismo archivo se sigue rechazando', async () => {
    const { importCsvFile, previewCsvFile } = await import('./importer');
    expect((await previewCsvFile(Buffer.from(ORDEN))).originalRowsMissing).toBe(0);
    await expect(importCsvFile(Buffer.from(ORDEN), 'orden.csv')).rejects.toThrow('Este CSV exacto ya fue importado');
  });

  it('una exportación solapada completa las filas que ya estaban y nunca sobrescribe', async () => {
    const { importCsvFile } = await import('./importer');
    await pool.query(`UPDATE raw_transactions SET original_row = NULL WHERE original_row->>'Coin' = 'USDC'`);
    await pool.query(`UPDATE raw_transactions SET original_row = original_row || '{"Remark": "guardado"}' WHERE original_row->>'Change' = '60'`);
    const ampliado = `${ORDEN}\n999,2024-03-02 10:00:00,Spot,Deposit,EUR,100,`;
    const r = await importCsvFile(Buffer.from(ampliado), 'ampliado.csv');
    expect(r).toMatchObject({ newTransactions: 1, originalRowsCompleted: 2 });
    const rows = await filas();
    expect(rows.find(f => f.original_row?.Change === '60')?.original_row?.Remark).toBe('guardado');
    expect(rows.find(f => f.original_row?.Coin === 'EUR')?.original_row).toMatchObject({ Operation: 'Deposit', Change: '100' });
  });

  it('Bitvavo guarda todas sus columnas, también el Transaction ID', async () => {
    const { importCsvFile } = await import('./importer');
    const csv = [BITVAVO, 'Europe/Madrid,2024-04-01,12:00:00,deposit,EUR,50,,,,,,,Completed,tx-sint-1,'].join('\n');
    await importCsvFile(Buffer.from(csv), 'bitvavo.csv', {}, {}, undefined, undefined, 'bitvavo');
    const row = (await pool.query(`SELECT original_row FROM raw_transactions WHERE original_row->>'Transaction ID' = 'tx-sint-1'`)).rows[0];
    expect(row.original_row).toMatchObject({ Type: 'deposit', Currency: 'EUR', Amount: '50', Status: 'Completed', Timezone: 'Europe/Madrid' });
  });
});
