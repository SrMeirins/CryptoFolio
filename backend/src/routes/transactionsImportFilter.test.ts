import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// GET /api/transactions?import_id= (#324): transacciones de una importación. Datos sintéticos.
describe('GET /api/transactions con import_id', () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let app: import('express').Express;
  let importA: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const w = (await pool.query(`SELECT id FROM wallets LIMIT 1`)).rows[0].id;
    importA = (await pool.query(`INSERT INTO csv_imports (filename, file_hash, row_count, skipped_count, exchange) VALUES ('a.csv', 'h-a', 1, 0, 'binance') RETURNING id`)).rows[0].id;
    const importB = (await pool.query(`INSERT INTO csv_imports (filename, file_hash, row_count, skipped_count, exchange) VALUES ('b.csv', 'h-b', 1, 0, 'binance') RETURNING id`)).rows[0].id;
    for (const [imp, asset] of [[importA, 'XRP'], [importA, 'ADA'], [importB, 'DOT']]) {
      await pool.query(
        `INSERT INTO transactions (import_id, operation_type, timestamp, asset, amount, amount_net, wallet_id)
         VALUES ($1, 'DEPOSIT_FIAT', now(), $2, 1, 1, $3)`, [imp, asset, w]);
    }
    app = (await import('../app')).default;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('devuelve solo las transacciones de esa importación', async () => {
    const r = await request(app).get(`/api/transactions?import_id=${importA}`);
    expect(r.status).toBe(200);
    expect(r.body.transactions.map((t: { asset: string }) => t.asset).sort()).toEqual(['ADA', 'XRP']);
    expect(Number(r.body.total)).toBe(2);
  });

  it('un import_id que no es UUID devuelve 400 sin llegar a la BD', async () => {
    const r = await request(app).get(`/api/transactions?import_id=1%27%20OR%201%3D1`);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/import_id/);
  });
});
