import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// settingsConfig.ts no tenía NINGÚN test propio (config/stats). El router se
// importa dinámicamente DESPUÉS de fijar DATABASE_URL (ver el comentario
// detallado en modules/csv/confirmImport.test.ts).
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('routes/settings — config y stats', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const { default: router } = await import('./settingsConfig');
    app = express();
    app.use(express.json());
    app.use('/api/settings', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  describe('PUT /config', () => {
    it('rechaza sin key con 400', async () => {
      const res = await request(app).put('/api/settings/config').send({ value: 'x' });
      expect(res.status).toBe(400);
    });

    it('rechaza sin value con 400', async () => {
      const res = await request(app).put('/api/settings/config').send({ key: 'mi_clave' });
      expect(res.status).toBe(400);
    });

    it('acepta key+value y GET /config lo refleja', async () => {
      const put = await request(app).put('/api/settings/config').send({ key: 'mi_clave', value: 'mi_valor' });
      expect(put.status).toBe(200);

      const get = await request(app).get('/api/settings/config');
      expect(get.body.mi_clave).toBe('mi_valor');
    });

    it('acepta un value numérico, guardado como string', async () => {
      await request(app).put('/api/settings/config').send({ key: 'umbral', value: 42 });
      const get = await request(app).get('/api/settings/config');
      expect(get.body.umbral).toBe('42');
    });

    it('un PUT repetido sobre la misma key la actualiza (ON CONFLICT)', async () => {
      await request(app).put('/api/settings/config').send({ key: 'mi_clave', value: 'actualizado' });
      const get = await request(app).get('/api/settings/config');
      expect(get.body.mi_clave).toBe('actualizado');
    });
  });

  describe('PUT /config — display_currency (#176)', () => {
    it('acepta EUR y USD y GET /config lo refleja', async () => {
      for (const currency of ['USD', 'EUR']) {
        const put = await request(app).put('/api/settings/config').send({ key: 'display_currency', value: currency });
        expect(put.status).toBe(200);
        const get = await request(app).get('/api/settings/config');
        expect(get.body.display_currency).toBe(currency);
      }
    });

    it('rechaza una moneda no soportada con 400 y no la guarda', async () => {
      for (const value of ['GBP', 'usd', 1, true]) {
        const put = await request(app).put('/api/settings/config').send({ key: 'display_currency', value });
        expect(put.status).toBe(400);
      }
      const get = await request(app).get('/api/settings/config');
      expect(get.body.display_currency).toBe('EUR');
    });
  });

  describe('PUT /config — theme (#197)', () => {
    it('acepta dark, light y system', async () => {
      for (const theme of ['light', 'system', 'dark']) {
        const put = await request(app).put('/api/settings/config').send({ key: 'theme', value: theme });
        expect(put.status).toBe(200);
        const get = await request(app).get('/api/settings/config');
        expect(get.body.theme).toBe(theme);
      }
    });

    it('rechaza otros valores con 400 y no los guarda', async () => {
      for (const value of ['blue', 'Dark', '', 1]) {
        const put = await request(app).put('/api/settings/config').send({ key: 'theme', value });
        expect(put.status).toBe(400);
      }
      const get = await request(app).get('/api/settings/config');
      expect(get.body.theme).toBe('dark');
    });
  });

  describe('PUT /config — preferencias de General (#446)', () => {
    const put = (key: string, value: unknown) => request(app).put('/api/settings/config').send({ key, value });

    it('umbral de polvo: importes de 0 a 1000 con hasta dos decimales', async () => {
      for (const value of ['0', '1', '2.5', '1000']) expect((await put('dust_threshold_eur', value)).status).toBe(200);
      for (const value of ['-1', '1000.01', '1,5', '2.555', 'abc', '', '1e3', 5]) expect((await put('dust_threshold_eur', value)).status).toBe(400);
      expect((await request(app).get('/api/settings/config')).body.dust_threshold_eur).toBe('1000');
    });

    it('privacidad al abrir: solo true o false', async () => {
      for (const value of ['true', 'false']) expect((await put('privacy_on_start', value)).status).toBe(200);
      for (const value of ['yes', '1', '', true]) expect((await put('privacy_on_start', value)).status).toBe(400);
      expect((await request(app).get('/api/settings/config')).body.privacy_on_start).toBe('false');
    });

    it('página de inicio: solo las de la lista blanca', async () => {
      for (const value of ['/portfolio', '/fiscal', '/history', '/']) expect((await put('start_page', value)).status).toBe(200);
      for (const value of ['/settings', 'https://ejemplo.invalid', '//evil', '/history?x=1', '']) expect((await put('start_page', value)).status).toBe(400);
      expect((await request(app).get('/api/settings/config')).body.start_page).toBe('/');
    });
  });

  describe('PUT /config — avisos (#447)', () => {
    const put = (key: string, value: unknown) => request(app).put('/api/settings/config').send({ key, value });

    it('categorías silenciadas: lista JSON de categorías conocidas', async () => {
      for (const value of ['["precios","fiscal"]', '[]']) expect((await put('notifications_muted', value)).status).toBe(200);
      for (const value of ['["otra"]', '["fiscal","fiscal"]', 'fiscal', '{}']) expect((await put('notifications_muted', value)).status).toBe(400);
    });

    it('los descartes solo se escriben con su propia API', async () => {
      expect((await put('notifications_dismissed', '{}')).status).toBe(400);
    });

    it('los tipos IRPF ya no se escriben aquí, sino por ejercicio (#452)', async () => {
      expect((await put('irpf_tramos_tipos', '[19,21,23,27,30]')).status).toBe(400);
    });
  });

  describe('GET /stats', () => {
    it('devuelve los 6 contadores esperados', async () => {
      const res = await request(app).get('/api/settings/stats');
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(
        ['assets', 'fifoLots', 'imports', 'priceCache', 'transactions', 'wallets'].sort()
      );
      expect(typeof res.body.transactions).toBe('number');
    });
  });
});
