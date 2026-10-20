import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Cobertura temporal (#328): endpoints, revisiones, encaje en la vista previa y
// campana. Precios mockeados (sin red); app importada tras fijar DATABASE_URL.
// Datos sintéticos.
vi.mock('../../modules/prices/binance', async (orig) => ({
  ...(await orig<typeof import('../../modules/prices/binance')>()),
  getHistoricalPriceEur: vi.fn(() => Promise.resolve(100)),
  refreshLivePrices: vi.fn(() => Promise.resolve()),
}));

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const csv = (rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'), 'utf-8');

let testDb: TestDatabase;
let app: import('express').Express;

describe('cobertura de importaciones (#328)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    app = (await import('../../app')).default;
    // Dos importaciones de Binance con un hueco entre ellas (marzo) y ya antiguas.
    await request(app).post('/api/imports').attach('file', csv(['1,2024-01-05 10:00:00,Spot,Deposit,EUR,100,', '1,2024-02-20 10:00:00,Spot,Deposit,EUR,100,']), 'ene-feb.csv');
    await request(app).post('/api/imports').attach('file', csv(['1,2024-04-10 10:00:00,Spot,Deposit,EUR,100,', '1,2024-06-30 10:00:00,Spot,Deposit,EUR,100,']), 'abr-jun.csv');
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  it('GET devuelve tramos, el hueco, el pendiente y la actividad mensual', async () => {
    const r = await request(app).get('/api/imports/cobertura');
    expect(r.status).toBe(200);
    const b = r.body.find((c: { exchange: string }) => c.exchange === 'binance');
    expect(b.tramos).toHaveLength(2);
    expect(b.huecos).toEqual([{ desde: '2024-02-21', hasta: '2024-04-09', dias: 49, revisionId: null }]);
    expect(b.pendiente.desde).toBe('2024-07-01');
    expect(b.meses.map((m: { mes: string }) => m.mes)).toEqual(['2024-01', '2024-02', '2024-04', '2024-06']);
  });

  it('revisar un hueco persiste, se refleja y se puede deshacer; la validación rechaza lo inválido', async () => {
    const post = await request(app).post('/api/imports/cobertura/revisiones').send({ exchange: 'binance', tipo: 'hueco', desde: '2024-02-21', hasta: '2024-04-09' });
    expect(post.status).toBe(201);
    const con = (await request(app).get('/api/imports/cobertura')).body[0];
    expect(con.huecos[0].revisionId).toBe(post.body.id);
    expect((await request(app).delete(`/api/imports/cobertura/revisiones/${post.body.id}`)).status).toBe(200);
    expect((await request(app).delete(`/api/imports/cobertura/revisiones/${post.body.id}`)).status).toBe(404);
    expect((await request(app).delete('/api/imports/cobertura/revisiones/no-es-uuid')).status).toBe(400);
    for (const body of [
      { exchange: 'kraken', tipo: 'hueco', desde: '2024-01-01', hasta: '2024-01-02' },
      { exchange: 'binance', tipo: 'hueco', desde: '2024-03-01', hasta: '2024-01-02' },
      { exchange: 'binance', tipo: 'hueco', desde: "2024-01-01'; DROP TABLE x;--", hasta: '2024-01-02' },
    ]) expect((await request(app).post('/api/imports/cobertura/revisiones').send(body)).status).toBe(400);
  });

  it('la vista previa explica cómo encaja el archivo (rellena el hueco y avanza)', async () => {
    const r = await request(app).post('/api/imports/preview')
      .attach('file', csv(['1,2024-02-25 10:00:00,Spot,Deposit,EUR,50,', '1,2024-08-15 10:00:00,Spot,Deposit,EUR,50,']), 'nuevo.csv');
    expect(r.status).toBe(200);
    expect(r.body.encaje.cambios.map((c: { tipo: string }) => c.tipo)).toEqual(['rellena', 'avanza']);
    expect(r.body.validation.warnings.some((w: string) => /Gap de/.test(w))).toBe(false);
  });

  it('la campana avisa del exchange sin importar hace más de 60 días y del hueco sin revisar', async () => {
    const r = await request(app).get('/api/settings/notifications');
    const ids = r.body.map((n: { id: string }) => n.id);
    expect(ids).toContain('import-stale-binance');
    expect(ids).toContain('import-huecos');
  });
});
