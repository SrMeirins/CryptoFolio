import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Sin precios externos (#359): este test no depende de ellos y no debe salir
// a internet; con el modo sin red los proveedores fallan al instante.
beforeAll(() => { vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true'); });
afterAll(() => { vi.unstubAllEnvs(); });

// #320: la importación guarda dirección, red y hash de los retiros emparejados
// con el historial de retiradas, y los completa en retiros ya importados sin
// ellos. Datos sintéticos.
const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const RET = 'Time,Coin,Network,Amount,Fee,Address,TXID,Status';
const HASH = 'd'.repeat(64);

let testDb: TestDatabase;
let pool: Pool;

describe('importCsvFile — destino on-chain de los retiros (#320)', () => {
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
    `SELECT t.counterparty_address AS address, n.name AS red, t.tx_hash
     FROM transactions t LEFT JOIN networks n ON n.id = t.counterparty_network_id WHERE t.asset = 'XRP'`,
  )).rows[0];

  it('sin historial no guarda dirección; al reimportar con él, la completa sin duplicar', async () => {
    const { importCsvFile } = await import('./importer');
    const tx = [HEADER, '123,2024-05-10 10:10:00,Spot,Withdraw,XRP,-10.2,'];
    await importCsvFile(Buffer.from(tx.join('\n')), 'a.csv', { XRP: '__external__' });
    expect(await fila()).toEqual({ address: null, red: null, tx_hash: null });

    const retiradas = Buffer.from([RET, `2024-05-10 10:00:00,XRP,XRP,10,0.2,rSintetica1234,${HASH},Completed`].join('\n'));
    // Otro archivo (rango ampliado) con la misma fila: duplicada, pero recibe el destino.
    const ampliado = [...tx, '123,2024-05-11 10:00:00,Spot,Deposit,EUR,100,'];
    const r = await importCsvFile(Buffer.from(ampliado.join('\n')), 'b.csv', {}, {}, undefined, undefined, 'binance', [retiradas]);
    expect(r.duplicateRows).toBe(1);
    expect(await fila()).toEqual({ address: 'rSintetica1234', red: 'XRP Ledger', tx_hash: HASH });
    expect((await pool.query(`SELECT count(*)::int AS n FROM transactions WHERE asset = 'XRP'`)).rows[0].n).toBe(1);
    // Y separa la comisión de red del retiro ya importado (#335).
    expect((await pool.query(`SELECT amount::float AS a, fee_amount::float AS f FROM transactions WHERE asset = 'XRP'`)).rows[0]).toEqual({ a: 10, f: 0.2 });
  });

  it('un retiro nuevo emparejado se inserta con su destino', async () => {
    const { importCsvFile } = await import('./importer');
    const tx = [HEADER, '123,2024-07-01 12:30:00,Spot,Withdraw,ADA,-50.5,'];
    const retiradas = Buffer.from([RET, `2024-07-01 12:00:00,ADA,ADA,50,0.5,addr1sintetica0000,${HASH},Completed`].join('\n'));
    await importCsvFile(Buffer.from(tx.join('\n')), 'c.csv', {}, {}, undefined, undefined, 'binance', [retiradas]);
    const row = (await pool.query(
      `SELECT t.counterparty_address AS address, n.name AS red FROM transactions t
       LEFT JOIN networks n ON n.id = t.counterparty_network_id WHERE t.asset = 'ADA'`,
    )).rows[0];
    expect(row).toEqual({ address: 'addr1sintetica0000', red: 'Cardano' });
    // Retiro nuevo con comisión separada (#335): llegan 50 ADA y 0,5 son comisión.
    expect((await pool.query(`SELECT amount::float AS a, amount_net::float AS n, fee_asset, fee_amount::float AS f FROM transactions WHERE asset = 'ADA'`)).rows[0])
      .toEqual({ a: 50, n: 50, fee_asset: 'ADA', f: 0.5 });
  });
});
