import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Valida con Zod: DELETE /api/wallets/:id (id debe ser UUID) y
// POST /api/wallets/:id/addresses (custom_explorer_url debe ser una URL válida).
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;
let networkId: string;

describe('routes/wallets — validación Zod', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(
      `INSERT INTO wallets (name, type) VALUES ('Wallet Zod addr test', 'hardware') RETURNING id`
    );
    walletId = wallet.rows[0].id;

    const net = await pool.query(`SELECT id FROM networks WHERE name = 'Ethereum'`);
    networkId = net.rows[0].id;

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('DELETE /api/wallets/:id rechaza con 400 un id que no es UUID (antes fallaba en Postgres con error genérico)', async () => {
    const res = await request(app).delete('/api/wallets/no-soy-un-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    // No debe filtrar el error interno de tipo de Postgres
    expect(JSON.stringify(res.body)).not.toMatch(/invalid input syntax/i);
  });

  it('DELETE /api/wallets/:id con un UUID inexistente sigue devolviendo 404 (comportamiento previo intacto)', async () => {
    const res = await request(app).delete('/api/wallets/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('POST /:id/addresses rechaza con 400 un custom_explorer_url que no es una URL válida', async () => {
    const res = await request(app)
      .post(`/api/wallets/${walletId}/addresses`)
      .send({
        network_id: null,
        custom_network: 'Mi red custom',
        custom_explorer_url: 'no-es-una-url',
        address: '0xabc',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('POST /:id/addresses acepta una petición válida y se comporta igual que antes (201)', async () => {
    const res = await request(app)
      .post(`/api/wallets/${walletId}/addresses`)
      .send({
        network_id: networkId,
        custom_network: null,
        custom_explorer_url: null,
        address: '0xdeadbeef',
      });

    expect(res.status).toBe(201);
    expect(res.body.address).toBe('0xdeadbeef');
  });

  it('POST /:id/addresses sigue rechazando con 400 si faltan network_id y custom_network (comportamiento previo)', async () => {
    const res = await request(app)
      .post(`/api/wallets/${walletId}/addresses`)
      .send({ address: '0x123' });

    expect(res.status).toBe(400);
  });
});
