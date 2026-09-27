import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

let testDb: TestDatabase;
let pool: Pool;

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

async function loadImporterWithTestDb() {
  process.env.DATABASE_URL = testDb.connectionString;
  return import('./importer');
}

describe('importCsvFile — falla explícito si falta una wallet de sistema esperada', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  // "Cuenta Inexistente" no está en ACCOUNT_TO_WALLET ni coincide con ninguna
  // wallet de sistema — mismo código que se ejecutaría si la wallet esperada
  // se hubiera borrado manualmente antes del import (protegido aparte por el
  // trigger BEFORE DELETE, pero getWalletId debe fallar igual de explícito
  // ante cualquier nombre sin wallet asociada).
  it('rechaza el import con un mensaje claro en vez de asignar a una wallet arbitraria', async () => {
    const { importCsvFile } = await loadImporterWithTestDb();
    const buffer = Buffer.from(csv(['123,2024-05-10 10:00:00,Cuenta Inexistente,Withdraw,BTC,-0.5,']), 'utf-8');

    await expect(importCsvFile(buffer, 'test.csv')).rejects.toThrow(/Cuenta Inexistente/);
  });
});
