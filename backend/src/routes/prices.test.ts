import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// getAllLivePrices() ya incluye los precios CoinGecko-only (refresco
// periódico en binance.ts) — este test fija su contenido para verificar que
// GET /live los devuelve tal cual, sin la lógica redundante que antes vivía
// aquí (fetch directo a CoinGecko, eliminada en este mismo turno).
vi.mock('../modules/prices/binance', () => ({
  getAllLivePrices: () => new Map([['BTC', 50000], ['EUR', 1], ['NFT', 0.0012]]),
  onPriceUpdate: vi.fn(),
  getHistoricalPriceEur: vi.fn(),
}));

describe('GET /api/prices/live', () => {
  let testDb: TestDatabase;
  let app: import('express').Express;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    app = (await import('../app')).default;
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  it('devuelve getAllLivePrices() tal cual, incluyendo activos CoinGecko-only', async () => {
    const res = await request(app).get('/api/prices/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ BTC: 50000, EUR: 1, NFT: 0.0012 });
  });
});
