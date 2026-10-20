import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Vista previa con el historial de retiradas de Binance (#320). Fichero propio:
// db/client se carga una vez por fichero de test. Datos sintéticos.
const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const csv = (rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'), 'utf-8');
const ROWS = ['123,2024-06-01 10:00:00,Spot,Withdraw,BTC,-0.5,'];

describe('POST /api/imports/preview con historial de retiradas de Binance (#320)', () => {
  let testDb2: TestDatabase;
  let app2: import('express').Express;
  const RET = 'Time,Coin,Network,Amount,Fee,Address,TXID,Status';
  const retiradas = (rows: string[]) => Buffer.from([RET, ...rows].join('\n'), 'utf-8');

  beforeAll(async () => {
    testDb2 = await createTestDatabase();
    process.env.DATABASE_URL = testDb2.connectionString;
    const { default: preview } = await import('./importsPreview');
    app2 = express();
    app2.use('/api/imports', preview);
  });
  afterAll(async () => { if (testDb2) await testDb2.teardown(); });

  it('añade dirección, red y hash a los retiros emparejados y resume el emparejamiento', async () => {
    const r = await request(app2).post('/api/imports/preview')
      .attach('file', csv(['123,2024-06-01 10:20:00,Spot,Withdraw,XRP,-10.2,', '123,2024-06-05 10:00:00,Spot,Withdraw,XRP,-3,']), 'a.csv')
      .attach('withdrawals', retiradas([`2024-06-01 10:00:00,XRP,XRP,10,0.2,rSintetica1234,${'c'.repeat(64)},Completed`]), 'w.csv');
    expect(r.status).toBe(200);
    const [conDestino, sinDestino] = r.body.transactions;
    expect(conDestino.destino).toMatchObject({ address: 'rSintetica1234', network: 'XRP Ledger', txHash: 'c'.repeat(64) });
    expect(sinDestino.destino).toBeUndefined();
    expect(r.body.retiradas).toEqual({ filas: 1, emparejadas: 1, retiros: 2 });
  });

  it('un historial de retiradas con otras columnas se rechaza con 400', async () => {
    const r = await request(app2).post('/api/imports/preview')
      .attach('file', csv(ROWS), 'a.csv')
      .attach('withdrawals', Buffer.from('a,b\n1,2'), 'w.csv');
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/historial de retiradas/);
  });
});
