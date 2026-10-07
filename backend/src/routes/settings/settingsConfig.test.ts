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
