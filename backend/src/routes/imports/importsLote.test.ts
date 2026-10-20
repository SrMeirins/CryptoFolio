import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Lote de varios archivos (#326): vista previa conjunta y confirmación con una
// importación por archivo y FIFO una sola vez. Precios mockeados (sin red);
// routers importados tras fijar DATABASE_URL. Datos sintéticos.
vi.mock('../../modules/prices/binance', () => ({
  loadAssetMetadata: vi.fn(() => Promise.resolve()),
  getHistoricalPriceEur: vi.fn(() => Promise.resolve(100)),
  refreshLivePrices: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../modules/prices/coingecko', () => ({
  setCoinGeckoStatusCallback: vi.fn(),
  prefetchHistoricalPrices: vi.fn(() => Promise.resolve()),
}));

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const csv = (rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'), 'utf-8');
const A = ['123,2024-08-01 10:00:00,Spot,Deposit,EUR,100,', '123,2024-08-02 10:00:00,Spot,Deposit,EUR,200,'];
const B = ['123,2024-08-02 10:00:00,Spot,Deposit,EUR,200,', '123,2024-08-03 10:00:00,Spot,Deposit,EUR,300,'];
const eventos = (text: string) => text.split('\n\n').map(l => l.trim()).filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('lote de varios archivos (#326)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const { default: preview } = await import('./importsPreview');
    const { default: confirm } = await import('./importsConfirm');
    app = express();
    app.use('/api/imports', preview);
    app.use('/api/imports', confirm);
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('vista previa: repetidas entre archivos una sola vez y archivos no reconocidos apartados', async () => {
    const r = await request(app).post('/api/imports/preview')
      .attach('files', csv(A), 'a.csv').attach('files', csv(B), 'b.csv').attach('files', Buffer.from('col1,col2\n1,2'), 'raro.csv');
    expect(r.status).toBe(200);
    expect(r.body.newCount).toBe(3);
    expect(r.body.repetidasEnLote).toBe(1);
    expect(r.body.archivos.map((a: { estado: string }) => a.estado)).toEqual(['listo', 'listo', 'no_reconocido']);
    expect(r.body.deteccion).toBeUndefined();
  });

  it('más archivos que el máximo o exchanges inválidos → 400', async () => {
    let req = request(app).post('/api/imports/preview');
    for (let i = 0; i < 6; i++) req = req.attach('files', csv(A), `f${i}.csv`);
    expect((await req).status).toBe(400);
    const r = await request(app).post('/api/imports/preview').field('exchanges', '["kraken"]').attach('files', csv(A), 'a.csv');
    expect(r.status).toBe(400);
  });

  it('confirmación: una importación por archivo, FIFO una vez, desglose y salto de un archivo ya importado', async () => {
    const r = await request(app).post('/api/imports/confirm')
      .field('exchanges', '["binance","binance"]')
      .attach('files', csv(A), 'a.csv').attach('files', csv(B), 'b.csv');
    const ev = eventos(r.text);
    expect(ev.at(-1).phase).toBe('done');
    expect(ev.filter(e => e.message === 'Ejecutando motor FIFO...')).toHaveLength(1);
    const resumen = ev.at(-1).resumen;
    expect(resumen.archivos.map((a: { archivo: string; nuevas: number; duplicadas: number }) => [a.archivo, a.nuevas, a.duplicadas]))
      .toEqual([['a.csv', 2, 0], ['b.csv', 1, 1]]);
    expect(resumen.nuevas).toBe(3);
    expect((await pool.query(`SELECT count(*)::int AS n FROM csv_imports`)).rows[0].n).toBe(2);
    expect((await pool.query(`SELECT count(*)::int AS n FROM transactions`)).rows[0].n).toBe(3);

    // Reenviar a.csv junto a un archivo nuevo: a.csv se salta y el lote continúa.
    const C = ['123,2024-08-04 10:00:00,Spot,Deposit,EUR,400,'];
    const r2 = await request(app).post('/api/imports/confirm')
      .attach('files', csv(A), 'a.csv').attach('files', csv(C), 'c.csv');
    const ev2 = eventos(r2.text);
    expect(ev2.at(-1).phase).toBe('done');
    expect(ev2.some(e => /ya estaba importado: se salta/.test(e.message))).toBe(true);
    expect(ev2.at(-1).resumen.archivos.map((a: { archivo: string }) => a.archivo)).toEqual(['c.csv']);
  });
});
