import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

let testDb: TestDatabase;
let pool: Pool;

describe('csv_imports.exchange — CHECK a nivel de BD', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('rechaza un valor de exchange no soportado', async () => {
    await expect(pool.query(
      `INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('a.csv', 'h1', 'kraken')`
    )).rejects.toThrow();
  });

  it('acepta binance y bitvavo', async () => {
    await expect(pool.query(
      `INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('a.csv', 'h2', 'binance')`
    )).resolves.toBeDefined();
    await expect(pool.query(
      `INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('b.csv', 'h3', 'bitvavo')`
    )).resolves.toBeDefined();
  });
});
