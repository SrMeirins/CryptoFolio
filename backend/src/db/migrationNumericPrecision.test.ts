import { describe, expect, it, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

let testDb: TestDatabase;

describe('esquema — precisión NUMERIC(38,18) para cantidad/precio', () => {
  it('las 19 columnas de cantidad/precio tienen escala 18, no 10', async () => {
    testDb = await createTestDatabase();
    const pool = new Pool({ connectionString: testDb.connectionString });
    try {
      const res = await pool.query(`
        SELECT table_name, column_name, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_name IN ('wallet_addresses','raw_transactions','transactions','fifo_lots','fifo_lot_consumptions','price_cache')
          AND data_type = 'numeric'
        ORDER BY table_name, column_name
      `);
      expect(res.rows.length).toBe(19);
      for (const row of res.rows) {
        expect(row.numeric_precision).toBe(38);
        expect(row.numeric_scale).toBe(18);
      }
    } finally {
      await pool.end();
    }
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });
});
