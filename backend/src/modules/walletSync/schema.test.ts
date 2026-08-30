import { describe, expect, it, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

let testDb: TestDatabase;

describe('esquema — network_api_keys y balance_sync_log', () => {
  it('crea ambas tablas con las columnas esperadas', async () => {
    testDb = await createTestDatabase();
    const pool = new Pool({ connectionString: testDb.connectionString });
    try {
      const keys = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'network_api_keys' ORDER BY column_name
      `);
      expect(keys.rows.map(r => r.column_name)).toEqual(
        ['api_key_encrypted', 'api_key_iv', 'network_id', 'updated_at']
      );

      const log = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'balance_sync_log' ORDER BY column_name
      `);
      expect(log.rows.map(r => r.column_name)).toEqual([
        'asset', 'checked_at', 'discrepancy_pct', 'expected_balance',
        'id', 'onchain_balance', 'status', 'wallet_address_id',
      ]);
    } finally {
      await pool.end();
    }
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });
});
