import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// importsCrud.ts no tenía test propio — ninguno de los 3 endpoints
// (POST /, GET /, DELETE /:id) tenía cobertura dentro del antiguo
// routes/imports.ts. El router se importa dinámicamente DESPUÉS de fijar
// DATABASE_URL (ver el comentario detallado en confirmImport.test.ts).
const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('routes/imports — CRUD (POST /, GET /, DELETE /:id)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const { default: router } = await import('./importsCrud');
    app = express();
    app.use('/api/imports', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('POST / sin fichero devuelve 400', async () => {
    const res = await request(app).post('/api/imports');
    expect(res.status).toBe(400);
  });

  it('POST / importa un CSV válido y GET / lo lista con sus agregados', async () => {
    const buffer = Buffer.from(csv(['123,2024-06-01 10:00:00,Spot,Withdraw,BTC,-0.5,']), 'utf-8');
    const res = await request(app).post('/api/imports').attach('file', buffer, 'test.csv');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.newTransactions).toBe(1);

    const list = await request(app).get('/api/imports');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(Number(list.body[0].transaction_count)).toBe(1);
    expect(Number(list.body[0].withdraw_count)).toBe(1);
  });

  it('POST / con el mismo CSV ya importado devuelve 409', async () => {
    const buffer = Buffer.from(csv(['123,2024-06-01 10:00:00,Spot,Withdraw,BTC,-0.5,']), 'utf-8');
    const res = await request(app).post('/api/imports').attach('file', buffer, 'test.csv');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ya fue importado/);
  });

  it('DELETE /:id borra el import y sus transacciones asociadas', async () => {
    const list = await request(app).get('/api/imports');
    const importId = list.body[0].id;

    const res = await request(app).delete(`/api/imports/${importId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const after = await request(app).get('/api/imports');
    expect(after.body).toHaveLength(0);
    const txCheck = await pool.query('SELECT COUNT(*) FROM transactions');
    expect(Number(txCheck.rows[0].count)).toBe(0);
  });
});
