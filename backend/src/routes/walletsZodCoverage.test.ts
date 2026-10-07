import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Cobertura de la validación Zod añadida en el turno de fragmentación de
// wallets.ts: antes de este cambio, POST /, PUT /:id, POST /networks y el
// CRUD de api-key no usaban Zod en absoluto (solo checks manuales sueltos o
// ninguno). Antes, un type inválido llegaba sin validar hasta Postgres y
// fallaba con un error genérico de enum — ahora se rechaza con 400 claro.
describe('routes/wallets — validación Zod añadida en la fragmentación', () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let app: import('express').Express;

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

  it('POST /api/wallets rechaza un type fuera del enum con 400 claro (antes: error genérico de Postgres)', async () => {
    const res = await request(app).post('/api/wallets').send({ name: 'Wallet inválida', type: 'no-es-un-tipo' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/invalid input value for enum/i);
  });

  it('POST /api/wallets acepta cada uno de los 4 tipos válidos del enum', async () => {
    for (const type of ['exchange', 'hardware', 'software', 'bank']) {
      const res = await request(app).post('/api/wallets').send({ name: `Wallet ${type}`, type });
      expect(res.status).toBe(201);
    }
  });

  it('PUT /api/wallets/:id rechaza un id que no es UUID con 400 (antes: sin validar, fallaba en Postgres)', async () => {
    const res = await request(app).put('/api/wallets/no-soy-un-uuid').send({ name: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST /api/wallets/networks rechaza si falta native_asset (antes: sin validar)', async () => {
    const res = await request(app).post('/api/wallets/networks').send({ name: 'Red sin asset nativo' });
    expect(res.status).toBe(400);
  });

  it('GET /api/wallets/networks/:networkId/api-key rechaza un networkId que no es UUID con 400 (antes: sin validar)', async () => {
    const res = await request(app).get('/api/wallets/networks/no-soy-un-uuid/api-key');
    expect(res.status).toBe(400);
  });

  it('PUT .../api-key rechaza un api_key vacío con 400 (antes: check manual equivalente, ahora vía Zod)', async () => {
    const net = await pool.query(`SELECT id FROM networks WHERE name = 'Bitcoin'`);
    const res = await request(app).put(`/api/wallets/networks/${net.rows[0].id}/api-key`).send({ api_key: '' });
    expect(res.status).toBe(400);
  });

  it('POST /:id/addresses rechaza un :id que no es UUID con 400 (antes: sin validar en este endpoint)', async () => {
    const res = await request(app)
      .post('/api/wallets/no-soy-un-uuid/addresses')
      .send({ custom_network: 'Red custom' });
    expect(res.status).toBe(400);
  });
});
