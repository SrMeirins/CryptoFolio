import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Sin precios externos (#359): este test no depende de ellos y no debe salir
// a internet; con el modo sin red los proveedores fallan al instante.
beforeAll(() => { vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true'); });
afterAll(() => { vi.unstubAllEnvs(); });

// #257: una retirada clasificada en el asistente como perdida (LOST) o regalo
// (GIFT_SENT) no tiene destino por definición; no debe quedar marcada con
// destination_pending. Solo una WITHDRAW sin destino está pendiente.
const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

let testDb: TestDatabase;
let pool: Pool;

describe('importCsvFile — destino pendiente según el tipo de retirada (#257)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    process.env.DATABASE_URL = testDb.connectionString;
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('LOST y GIFT_SENT sin destino pendiente; WITHDRAW sin destino, pendiente', async () => {
    const { importCsvFile } = await import('./importer');
    const csv = [
      HEADER,
      '123,2024-05-10 10:00:00,Spot,Withdraw,XRP,-10,',
      '123,2024-05-11 10:00:00,Spot,Withdraw,ADA,-20,',
      '123,2024-05-12 10:00:00,Spot,Withdraw,DOT,-30,',
    ].join('\n');
    const result = await importCsvFile(Buffer.from(csv, 'utf-8'), 'test.csv', { XRP: '__lost__', ADA: '__gift__' });
    expect(result.errors ?? []).toEqual([]);

    const rows = (await pool.query(
      `SELECT asset, operation_type::text AS op, destination_pending FROM transactions ORDER BY asset`,
    )).rows;
    expect(rows).toEqual([
      { asset: 'ADA', op: 'GIFT_SENT', destination_pending: false },
      { asset: 'DOT', op: 'WITHDRAW', destination_pending: true },
      { asset: 'XRP', op: 'LOST', destination_pending: false },
    ]);
  });
});
