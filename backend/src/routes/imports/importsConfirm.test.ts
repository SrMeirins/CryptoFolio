import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// POST /confirm no tenía NINGÚN test propio pese a ser el endpoint más
// complejo de todo routes/ (SSE + 3 fases de negocio). binance/coingecko se
// mockean para no depender de red — el router se importa dinámicamente
// DESPUÉS de fijar DATABASE_URL (ver el comentario detallado en
// confirmImport.test.ts: un import estático de algo que toque db/client.ts
// se evaluaría antes de este beforeAll y cachearía el Pool equivocado).
const { getHistoricalPriceEurMock, loadAssetMetadataMock } = vi.hoisted(() => ({
  getHistoricalPriceEurMock: vi.fn(() => Promise.resolve(100)),
  loadAssetMetadataMock: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../modules/prices/binance', () => ({
  loadAssetMetadata: loadAssetMetadataMock,
  getHistoricalPriceEur: getHistoricalPriceEurMock,
  refreshLivePrices: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../modules/prices/coingecko', () => ({
  setCoinGeckoStatusCallback: vi.fn(),
  prefetchHistoricalPrices: vi.fn(() => Promise.resolve()),
}));

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

// supertest buffer el stream SSE completo en res.text — se parsea en eventos
// {phase, message, progress, total} a partir de las líneas "data: ...".
function parseSseEvents(text: string): Array<{ phase: string; message: string }> {
  return text
    .split('\n\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice('data: '.length)));
}

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('POST /api/imports/confirm', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const { default: router } = await import('./importsConfirm');
    app = express();
    app.use('/api/imports', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('sin fichero devuelve 400 (antes de entrar en SSE)', async () => {
    const res = await request(app).post('/api/imports/confirm');
    expect(res.status).toBe(400);
  });

  it('un CSV sin depósitos externos completa las 3 fases hasta "done"', async () => {
    const buffer = Buffer.from(csv([
      '123,2024-07-01 10:00:00,Spot,Withdraw,BTC,-0.5,',
    ]), 'utf-8');

    const res = await request(app).post('/api/imports/confirm').attach('file', buffer, 'test.csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSseEvents(res.text);
    expect(events.some(e => e.phase === 'importing')).toBe(true);
    expect(events.some(e => e.phase === 'fifo')).toBe(true);
    expect(events.at(-1)?.phase).toBe('done');
  });

  it('un CSV con depósito cripto externo sin coste asignado bloquea en el gate 0 (fase "error", nunca llega a importar)', async () => {
    const before = await pool.query('SELECT COUNT(*) FROM csv_imports');
    const buffer = Buffer.from(csv([
      '123,2024-07-02 10:00:00,Spot,Deposit,ETH,2,',
    ]), 'utf-8');

    const res = await request(app).post('/api/imports/confirm').attach('file', buffer, 'test.csv');

    const events = parseSseEvents(res.text);
    expect(events).toHaveLength(1);
    expect(events[0].phase).toBe('error');
    expect(events[0].message).toMatch(/Revisión requerida/);

    const after = await pool.query('SELECT COUNT(*) FROM csv_imports');
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it('el mismo depósito con depositCosts asignado sí importa', async () => {
    const buffer = Buffer.from(csv([
      '123,2024-07-03 10:00:00,Spot,Deposit,ETH,2,',
    ]), 'utf-8');

    // Hash determinista: igual que confirmImport.ts, se obtiene parseando primero.
    const { parseExchangeCsv } = await import('../../modules/csv/exchanges');
    const preparse = await parseExchangeCsv('binance', buffer);
    const hash = preparse.transactions.find(tx => tx.needsCostReview)!.rawRowHashes[0];

    const res = await request(app)
      .post('/api/imports/confirm')
      .field('depositCosts', JSON.stringify({ [hash]: 2000 }))
      .attach('file', buffer, 'test.csv');

    const events = parseSseEvents(res.text);
    expect(events.at(-1)?.phase).toBe('done');

    const tx = await pool.query(`SELECT price_per_unit FROM transactions WHERE asset = 'ETH' AND notes LIKE '%externo%'`);
    expect(Number(tx.rows[0].price_per_unit)).toBe(2000);
  });

  it('un fichero con cabecera binaria (magic bytes) se rechaza sin llegar a parsear el CSV', async () => {
    const pngLike = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('resto del fichero')]);
    const res = await request(app).post('/api/imports/confirm').attach('file', pngLike, 'disfrazado.csv');

    const events = parseSseEvents(res.text);
    expect(events).toHaveLength(1);
    expect(events[0].phase).toBe('error');
    expect(events[0].message).toMatch(/no es un CSV válido/);
  });

  it('withdrawalDestinations inválido (no es un objeto) se reporta como fase "error"', async () => {
    const buffer = Buffer.from(csv(['123,2024-07-04 10:00:00,Spot,Withdraw,BTC,-0.1,']), 'utf-8');

    const res = await request(app)
      .post('/api/imports/confirm')
      .field('withdrawalDestinations', '["no","es","un","objeto"]')
      .attach('file', buffer, 'test.csv');

    const events = parseSseEvents(res.text);
    expect(events[0].phase).toBe('error');
    expect(events[0].message).toMatch(/withdrawalDestinations inválido/);
  });
});
