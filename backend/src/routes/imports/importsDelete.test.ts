import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Borrado de importaciones y subida de CSV (#316). El motor FIFO se sustituye
// por un espía: lo que se prueba es cuándo se relanza, no su resultado.
const runFifoEngine = vi.fn(async () => undefined);
vi.mock('../../modules/fifo/engine', () => ({ runFifoEngine }));

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const csv = (rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'), 'utf-8');

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('routes/imports — borrado y subida (#316)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const { default: router } = await import('./importsCrud');
    app = express();
    app.use('/api/imports', router);
  });
  beforeEach(() => runFifoEngine.mockClear());
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('borrar la última importación recalcula el FIFO si quedan transacciones manuales', async () => {
    expect((await request(app).post('/api/imports').attach('file', csv(['123,2024-06-01 10:00:00,Spot,Withdraw,BTC,-0.5,']), 'a.csv')).status).toBe(201);
    const wallet = (await pool.query(`SELECT id FROM wallets LIMIT 1`)).rows[0].id;
    await pool.query(`INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id) VALUES ('BUY', '2024-01-01T00:00:00Z', 'BTC', 1, 1, $1)`, [wallet]);
    const id = (await request(app).get('/api/imports')).body[0].id;
    runFifoEngine.mockClear();
    expect((await request(app).delete(`/api/imports/${id}`)).status).toBe(200);
    expect(runFifoEngine).toHaveBeenCalledTimes(1);
  });

  it('sin transacciones restantes no hace falta recalcular', async () => {
    await pool.query(`DELETE FROM transactions`);
    expect((await request(app).post('/api/imports').attach('file', csv(['123,2024-07-01 10:00:00,Spot,Withdraw,ETH,-1,']), 'b.csv')).status).toBe(201);
    const id = (await request(app).get('/api/imports')).body[0].id;
    runFifoEngine.mockClear();
    expect((await request(app).delete(`/api/imports/${id}`)).status).toBe(200);
    expect(runFifoEngine).not.toHaveBeenCalled();
  });

  it('id inválido: 400, no 500', async () => {
    const r = await request(app).delete('/api/imports/no-es-uuid');
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/inválido/);
  });

  it('errores de subida con su motivo: extensión, binario y tamaño', async () => {
    const txt = await request(app).post('/api/imports').attach('file', Buffer.from('hola'), 'a.txt');
    expect(txt.status).toBe(400);
    expect(txt.body.error).toBe('Solo se aceptan archivos .csv');
    const bin = await request(app).post('/api/imports').attach('file', Buffer.from([0x4d, 0x5a, 0x90, 0x00]), 'x.csv');
    expect(bin.status).toBe(400);
    expect(bin.body.error).toMatch(/no es un CSV de texto/);
    const big = await request(app).post('/api/imports').attach('file', Buffer.alloc(10 * 1024 * 1024 + 1, 97), 'big.csv');
    expect(big.status).toBe(413);
    expect(big.body.error).toMatch(/10 MB/);
  });
});
