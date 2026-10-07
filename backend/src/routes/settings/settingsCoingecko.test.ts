import { describe, expect, it, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

// settingsCoingecko.ts no tenía NINGÚN test propio (search/test/coingecko-id/
// pairs-test). Red mockeada por completo — no depende de Postgres, así que
// no hace falta createTestDatabase ni el patrón de import dinámico de
// db/client.ts.
const { verifyCoinGeckoIdMock, updateCoinGeckoIdMock, searchCoinGeckoBySymbolMock, testPairMock } = vi.hoisted(() => ({
  verifyCoinGeckoIdMock: vi.fn(),
  updateCoinGeckoIdMock: vi.fn(() => Promise.resolve()),
  searchCoinGeckoBySymbolMock: vi.fn(),
  testPairMock: vi.fn(),
}));
vi.mock('../../modules/prices/coingecko', () => ({
  verifyCoinGeckoId: verifyCoinGeckoIdMock,
  updateCoinGeckoId: updateCoinGeckoIdMock,
  searchCoinGeckoBySymbol: searchCoinGeckoBySymbolMock,
}));
vi.mock('../../modules/prices/pairDetector', () => ({
  testPair: testPairMock,
}));
vi.mock('../../db/client', () => ({
  db: { query: vi.fn(() => Promise.resolve({ rows: [] })) },
}));

let app: import('express').Express;

describe('routes/settings — coingecko', () => {
  beforeAll(async () => {
    const { default: router } = await import('./settingsCoingecko');
    app = express();
    app.use(express.json());
    app.use('/api/settings', router);
  });

  describe('GET /coingecko/search', () => {
    it('rechaza un símbolo inválido con 400', async () => {
      const res = await request(app).get('/api/settings/coingecko/search?symbol=');
      expect(res.status).toBe(400);
    });

    it('devuelve found:false si no hay resultado', async () => {
      searchCoinGeckoBySymbolMock.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/settings/coingecko/search?symbol=XYZ');
      expect(res.body).toEqual({ found: false });
    });

    it('devuelve found:true con el id y precio si lo encuentra', async () => {
      searchCoinGeckoBySymbolMock.mockResolvedValueOnce({ id: 'bitcoin', price_eur: 50000 });
      const res = await request(app).get('/api/settings/coingecko/search?symbol=BTC');
      expect(res.body).toEqual({ found: true, coingecko_id: 'bitcoin', price_eur: 50000 });
    });
  });

  describe('GET /coingecko/test', () => {
    it('rechaza un id con mayúsculas o caracteres fuera de [a-z0-9-] con 400', async () => {
      const res = await request(app).get('/api/settings/coingecko/test?id=Bitcoin_Cash');
      expect(res.status).toBe(400);
    });

    it('rechaza si falta el parámetro id', async () => {
      const res = await request(app).get('/api/settings/coingecko/test');
      expect(res.status).toBe(400);
    });

    it('valid:true si verifyCoinGeckoId devuelve precio', async () => {
      verifyCoinGeckoIdMock.mockResolvedValueOnce(50000);
      const res = await request(app).get('/api/settings/coingecko/test?id=bitcoin');
      expect(res.body).toEqual({ id: 'bitcoin', price_eur: 50000, valid: true });
    });

    it('valid:false si verifyCoinGeckoId devuelve null', async () => {
      verifyCoinGeckoIdMock.mockResolvedValueOnce(null);
      const res = await request(app).get('/api/settings/coingecko/test?id=no-existe');
      expect(res.body).toEqual({ id: 'no-existe', price_eur: null, valid: false });
    });
  });

  describe('PUT /assets/:symbol/coingecko-id', () => {
    it('rechaza un símbolo inválido con 400', async () => {
      const res = await request(app).put('/api/settings/assets/no valido/coingecko-id').send({ coingecko_id: 'bitcoin' });
      expect(res.status).toBe(400);
    });

    it('rechaza un coingecko_id con formato inválido con 400', async () => {
      const res = await request(app).put('/api/settings/assets/BTC/coingecko-id').send({ coingecko_id: 'Bitcoin!' });
      expect(res.status).toBe(400);
    });

    it('422 si el id no devuelve precio activo en CoinGecko', async () => {
      verifyCoinGeckoIdMock.mockResolvedValueOnce(null);
      const res = await request(app).put('/api/settings/assets/BTC/coingecko-id').send({ coingecko_id: 'id-muerto' });
      expect(res.status).toBe(422);
    });

    it('guarda el coingecko_id y devuelve el precio si es válido', async () => {
      verifyCoinGeckoIdMock.mockResolvedValueOnce(50000);
      const res = await request(app).put('/api/settings/assets/BTC/coingecko-id').send({ coingecko_id: 'bitcoin' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ symbol: 'BTC', coingecko_id: 'bitcoin', price_eur: 50000 });
      expect(updateCoinGeckoIdMock).toHaveBeenCalledWith('BTC', 'bitcoin');
    });
  });

  describe('POST /pairs/test', () => {
    it('rechaza sin pair con 400', async () => {
      const res = await request(app).post('/api/settings/pairs/test').send({});
      expect(res.status).toBe(400);
    });

    it('delega en testPair con el par en mayúsculas', async () => {
      testPairMock.mockResolvedValueOnce({ exists: true, price: 50000 });
      const res = await request(app).post('/api/settings/pairs/test').send({ pair: 'btceur' });
      expect(res.body).toEqual({ exists: true, price: 50000 });
      expect(testPairMock).toHaveBeenCalledWith('BTCEUR');
    });
  });
});
