import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

let testDb: TestDatabase;
let pool: Pool;

describe('Protección de wallets de sistema a nivel de BD (trigger)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('rechaza el DELETE directo de una wallet de sistema', async () => {
    const w = await pool.query(`SELECT id FROM wallets WHERE is_system = TRUE LIMIT 1`);
    await expect(pool.query(`DELETE FROM wallets WHERE id = $1`, [w.rows[0].id]))
      .rejects.toThrow(/wallet de sistema/);
  });

  it('permite borrar una wallet normal (no de sistema)', async () => {
    const w = await pool.query(`INSERT INTO wallets (name, type, is_system) VALUES ('W normal', 'hardware', FALSE) RETURNING id`);
    await expect(pool.query(`DELETE FROM wallets WHERE id = $1`, [w.rows[0].id])).resolves.toBeDefined();
  });
});
