import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Cierres diarios de varios activos en una consulta (#282).
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('GET /api/v1/prices/closes', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    // Cierres de los últimos 10 días para XRP y uno antiguo; ADA sin cierres.
    for (let i = 0; i < 10; i++) {
      await pool.query(
        `INSERT INTO price_close_madrid (asset, close_date, price_eur, source)
         VALUES ('XRP', (NOW() AT TIME ZONE 'Europe/Madrid')::date - $1::int, $2, 'binance_1h')`, [i, 1 + i / 10],
      );
    }
    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('devuelve los cierres de los últimos N días por activo, en orden, y vacío si no hay', async () => {
    const res = await request(app).get('/api/v1/prices/closes?assets=xrp,ADA&days=7');
    expect(res.status).toBe(200);
    expect(res.body.closes.XRP).toHaveLength(7);
    const dates = res.body.closes.XRP.map((c: { date: string }) => c.date);
    expect([...dates].sort()).toEqual(dates);
    expect(res.body.closes.XRP.at(-1).price).toBe(1);
    expect(res.body.closes.ADA).toEqual([]);
  });

  it('400 ante símbolos inválidos o días fuera de rango', async () => {
    expect((await request(app).get('/api/v1/prices/closes?assets=..%2Fetc')).status).toBe(400);
    expect((await request(app).get('/api/v1/prices/closes?assets=XRP&days=1')).status).toBe(400);
    expect((await request(app).get('/api/v1/prices/closes')).status).toBe(400);
  });
});
