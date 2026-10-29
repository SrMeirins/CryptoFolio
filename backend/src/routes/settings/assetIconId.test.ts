import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Corregir el logo de un activo (#449): id manual solo para el logo, o volver al
// automático. Sin red: la sincronización en segundo plano se simula.
vi.mock('../../modules/assets/assetIcons', () => ({ syncAssetIcons: vi.fn(() => Promise.resolve()) }));

let testDb: TestDatabase;
let pool: Pool;
let app: express.Express;

describe('PUT /settings/assets/:symbol/icon-id (#449)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const { default: router } = await import('./settingsAssets');
    app = express();
    app.use(express.json());
    app.use('/api/settings', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  const row = async () => (await pool.query(`SELECT coingecko_id, icon_coingecko_id, icon_id_source FROM asset_metadata WHERE symbol = 'BTC'`)).rows[0];

  it('fija un id manual sin tocar el de precios y descarta el logo guardado', async () => {
    await pool.query(`INSERT INTO asset_icons (symbol, status) VALUES ('BTC', 'missing') ON CONFLICT DO NOTHING`);
    const res = await request(app).put('/api/settings/assets/BTC/icon-id').send({ id: 'bitcoin-logo' });
    expect(res.status).toBe(200);
    expect(await row()).toEqual({ coingecko_id: 'bitcoin', icon_coingecko_id: 'bitcoin-logo', icon_id_source: 'manual' });
    expect((await pool.query(`SELECT count(*)::int AS n FROM asset_icons WHERE symbol = 'BTC'`)).rows[0].n).toBe(0);
  });

  it('con null vuelve al automático', async () => {
    expect((await request(app).put('/api/settings/assets/BTC/icon-id').send({ id: null })).status).toBe(200);
    expect(await row()).toMatchObject({ icon_coingecko_id: null, icon_id_source: null });
  });

  it('ids o símbolos no válidos dan 400; un activo desconocido, 404', async () => {
    for (const body of [{ id: 'Mal Id' }, { id: '../x' }, { id: 5 }, {}]) {
      expect((await request(app).put('/api/settings/assets/BTC/icon-id').send(body)).status).toBe(400);
    }
    expect((await request(app).put('/api/settings/assets/..%2Fx/icon-id').send({ id: 'ok' })).status).toBe(400);
    expect((await request(app).put('/api/settings/assets/NOEXISTE/icon-id').send({ id: 'ok' })).status).toBe(404);
  });
});
