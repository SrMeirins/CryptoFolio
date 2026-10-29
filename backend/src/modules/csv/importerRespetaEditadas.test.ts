import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// #378: al re-importar, una transacción importada y editada a mano no se toca
// (ni dirección ni comisión de red) y el resultado cuenta cuántas se respetan.
// Datos sintéticos; sin red (#359).
beforeAll(() => { vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true'); });
afterAll(() => { vi.unstubAllEnvs(); });

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const RET = 'Time,Coin,Network,Amount,Fee,Address,TXID,Status';
const HASH = 'e'.repeat(64);

let testDb: TestDatabase;
let pool: Pool;

describe('importCsvFile — respeta las importadas editadas (#378)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    process.env.DATABASE_URL = testDb.connectionString;
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  const fila = async () => (await pool.query(
    `SELECT counterparty_address AS address, amount::float AS amount, fee_amount::float AS fee, original_import IS NOT NULL AS editada
     FROM transactions WHERE asset = 'XRP'`,
  )).rows[0];

  it('no completa la dirección ni separa la comisión de una editada, y lo cuenta', async () => {
    const { importCsvFile } = await import('./importer');
    const tx = [HEADER, '123,2024-05-10 10:10:00,Spot,Withdraw,XRP,-10.2,'];
    await importCsvFile(Buffer.from(tx.join('\n')), 'a.csv', { XRP: '__external__' });
    // Edición a mano: otro importe, con la copia del original.
    await pool.query(`UPDATE transactions SET original_import = jsonb_build_object('amount', amount), amount = 9 WHERE asset = 'XRP'`);

    const retiradas = Buffer.from([RET, `2024-05-10 10:00:00,XRP,XRP,10,0.2,rSintetica5678,${HASH},Completed`].join('\n'));
    const ampliado = [...tx, '123,2024-05-11 10:00:00,Spot,Deposit,EUR,100,'];
    const r = await importCsvFile(Buffer.from(ampliado.join('\n')), 'b.csv', {}, {}, undefined, undefined, 'binance', [retiradas]);
    expect(r.duplicateRows).toBe(1);
    expect(r.editedKept).toBe(1);
    expect(await fila()).toEqual({ address: null, amount: 9, fee: null, editada: true });
  });

  it('sin ediciones no cuenta nada', async () => {
    const { importCsvFile } = await import('./importer');
    const r = await importCsvFile(Buffer.from([HEADER, '123,2024-06-01 10:00:00,Spot,Deposit,EUR,50,'].join('\n')), 'c.csv');
    expect(r.editedKept).toBe(0);
  });
});
