import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Valida con Zod los 7 campos de POST /api/settings/assets y
// PUT /api/settings/assets/:symbol (hoy solo se validaba `symbol` con SYMBOL_RE).
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('routes/settings — assets validación Zod', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM asset_metadata WHERE symbol = 'ZODT'`);
  });

  it('POST /assets rechaza con 400 cuando isStablecoin no es booleano', async () => {
    const res = await request(app)
      .post('/api/settings/assets')
      .send({ symbol: 'ZODT', name: 'Zod Test', isStablecoin: 'si-por-favor' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('POST /assets sigue rechazando con 400 cuando falta symbol (comportamiento previo)', async () => {
    const res = await request(app)
      .post('/api/settings/assets')
      .send({ name: 'Sin símbolo' });

    expect(res.status).toBe(400);
  });

  it('POST /assets acepta una petición válida y se comporta igual que antes', async () => {
    const res = await request(app)
      .post('/api/settings/assets')
      .send({ symbol: 'zodt', name: 'Zod Test', isStablecoin: false, binanceEurPair: 'ZODTEUR' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.symbol).toBe('ZODT');
  });

  it('PUT /assets/:symbol rechaza con 400 cuando binanceEurPair no es string', async () => {
    await pool.query(
      `INSERT INTO asset_metadata (symbol, name) VALUES ('ZODT', 'Zod Test')`
    );
    const res = await request(app)
      .put('/api/settings/assets/ZODT')
      .send({ name: 'Zod Test', binanceEurPair: 12345 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('PUT /assets/:symbol acepta una petición válida y se comporta igual que antes', async () => {
    await pool.query(
      `INSERT INTO asset_metadata (symbol, name) VALUES ('ZODT', 'Zod Test')`
    );
    const res = await request(app)
      .put('/api/settings/assets/ZODT')
      .send({ name: 'Zod Test actualizado', isStablecoin: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
