import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Vista previa: solo cuenta lo nuevo (#316). Routers importados tras fijar
// DATABASE_URL (db/client lo lee una vez al cargarse). Datos sintéticos.
const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const csv = (rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'), 'utf-8');
const ROWS = ['123,2024-06-01 10:00:00,Spot,Withdraw,BTC,-0.5,', '123,2024-06-02 10:00:00,Spot,Staking Rewards,ETH,0.01,'];

let testDb: TestDatabase;
let app: import('express').Express;

describe('POST /api/imports/preview (#316)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    const { default: preview } = await import('./importsPreview');
    const { default: crud } = await import('./importsCrud');
    app = express();
    app.use('/api/imports', preview);
    app.use('/api/imports', crud);
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  it('marca las filas nuevas y el aviso de precios cuenta solo las nuevas', async () => {
    const antes = (await request(app).post('/api/imports/preview').attach('file', csv(ROWS), 'a.csv')).body;
    expect(antes.transactions.every((t: { isNew: boolean }) => t.isNew)).toBe(true);
    expect(antes.validation.info.some((m: string) => m.startsWith('1 operaciones de rendimiento'))).toBe(true);

    expect((await request(app).post('/api/imports').attach('file', csv(ROWS), 'a.csv')).status).toBe(201);
    const despues = (await request(app).post('/api/imports/preview')
      .attach('file', csv([...ROWS, '123,2024-06-03 10:00:00,Spot,Withdraw,ETH,-0.2,']), 'b.csv')).body;
    expect(despues.newCount).toBe(1);
    expect(despues.transactions.filter((t: { isNew: boolean }) => t.isNew).map((t: { asset: string }) => t.asset)).toEqual(['ETH']);
    expect(despues.validation.info.some((m: string) => m.includes('operaciones de rendimiento'))).toBe(false);
  });

  it('errores de subida claros también en la vista previa', async () => {
    expect((await request(app).post('/api/imports/preview').attach('file', Buffer.from('hola'), 'a.txt')).status).toBe(400);
    expect((await request(app).post('/api/imports/preview').attach('file', Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'z.csv')).status).toBe(400);
  });
});
