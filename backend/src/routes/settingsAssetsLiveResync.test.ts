import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Las rutas que crean, editan o borran activos deben pedir la resincronización
// de las suscripciones de precios en vivo (#149).
const { requestLivePriceResyncMock } = vi.hoisted(() => ({ requestLivePriceResyncMock: vi.fn() }));
vi.mock('../modules/prices/liveFeed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../modules/prices/liveFeed')>()),
  requestLivePriceResync: requestLivePriceResyncMock,
}));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('routes/settings — assets piden resincronizar el feed en vivo', () => {
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

  beforeEach(async () => {
    requestLivePriceResyncMock.mockClear();
    await pool.query(`DELETE FROM asset_metadata WHERE symbol = 'RSYNC'`);
  });

  it('POST /assets (alta) pide resincronizar', async () => {
    const res = await request(app).post('/api/settings/assets')
      .send({ symbol: 'RSYNC', name: 'Resync', binanceEurPair: 'RSYNCEUR' });

    expect(res.status).toBe(200);
    expect(requestLivePriceResyncMock).toHaveBeenCalledTimes(1);
  });

  it('PUT /assets/:symbol (edición de pares) pide resincronizar', async () => {
    await pool.query(
      `INSERT INTO asset_metadata (symbol, name, binance_eur_pair, price_source) VALUES ('RSYNC', 'Resync', 'RSYNCEUR', 'eur_direct')`);

    const res = await request(app).put('/api/settings/assets/RSYNC')
      .send({ binanceUsdtPair: 'RSYNCUSDT' });

    expect(res.status).toBe(200);
    expect(requestLivePriceResyncMock).toHaveBeenCalledTimes(1);
  });

  it('DELETE /assets/:symbol pide resincronizar', async () => {
    await pool.query(
      `INSERT INTO asset_metadata (symbol, name, binance_eur_pair, price_source) VALUES ('RSYNC', 'Resync', 'RSYNCEUR', 'eur_direct')`);

    const res = await request(app).delete('/api/settings/assets/RSYNC');

    expect(res.status).toBe(200);
    expect(requestLivePriceResyncMock).toHaveBeenCalledTimes(1);
  });

  it('una petición rechazada por validación no resincroniza', async () => {
    const res = await request(app).post('/api/settings/assets').send({ name: 'sin símbolo' });

    expect(res.status).toBe(400);
    expect(requestLivePriceResyncMock).not.toHaveBeenCalled();
  });
});
