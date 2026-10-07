import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// settingsMaintenance.ts no tenía NINGÚN test propio salvo
// fix-stale-withdrawals (fuga de err.message, cubierto en
// settingsErrorLeak.test.ts aparte). El guard { confirm: true } y la
// validación Zod de bulk-set-costs son nuevos — getHistoricalPriceEur se
// mockea para no depender de red en /pending-deposits.
const { getHistoricalPriceEurMock } = vi.hoisted(() => ({
  getHistoricalPriceEurMock: vi.fn(() => Promise.resolve(100)),
}));
vi.mock('../../modules/prices/binance', () => ({
  getHistoricalPriceEur: getHistoricalPriceEurMock,
}));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('routes/settings — mantenimiento', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const { default: router } = await import('./settingsMaintenance');
    app = express();
    app.use(express.json());
    app.use('/api/settings', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  describe('DELETE /price-cache — guard de confirmación', () => {
    it('sin { confirm: true } en el body, rechaza con 400 y no borra nada', async () => {
      await pool.query(`INSERT INTO price_cache (asset, price_date, price_eur, source) VALUES ('BTC', '2024-01-01', 50000, 'test')`);

      const res = await request(app).delete('/api/settings/price-cache').send({});
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT COUNT(*) FROM price_cache');
      expect(Number(check.rows[0].count)).toBe(1);
    });

    it('con { confirm: true }, borra todo el caché', async () => {
      const res = await request(app).delete('/api/settings/price-cache').send({ confirm: true });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(1);

      const check = await pool.query('SELECT COUNT(*) FROM price_cache');
      expect(Number(check.rows[0].count)).toBe(0);
    });

    it('confirm: false (no exactamente true) se rechaza igual que ausente', async () => {
      const res = await request(app).delete('/api/settings/price-cache').send({ confirm: false });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /price-cache/failed', () => {
    it('sin guard de confirmación: borra solo los sentinels -1', async () => {
      await pool.query(`INSERT INTO price_cache (asset, price_date, price_eur, source) VALUES ('BTC', '2024-01-01', 50000, 'test')`);
      await pool.query(`INSERT INTO price_cache (asset, price_date, price_eur, source) VALUES ('LUNC', '2024-01-02', -1, 'test')`);

      const res = await request(app).delete('/api/settings/price-cache/failed');
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(1);

      const remaining = await pool.query('SELECT asset FROM price_cache');
      expect(remaining.rows.map(r => r.asset)).toEqual(['BTC']);
      await pool.query('DELETE FROM price_cache');
    });
  });

  describe('DELETE /data/transactions — guard de confirmación', () => {
    it('sin { confirm: true }, rechaza con 400 y no borra nada', async () => {
      const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet maintenance test', 'hardware') RETURNING id`);
      await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
         VALUES ('DEPOSIT_CRYPTO', NOW(), 'BTC', 1, 1, $1)`,
        [wallet.rows[0].id]
      );

      const res = await request(app).delete('/api/settings/data/transactions').send({});
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT COUNT(*) FROM transactions');
      expect(Number(check.rows[0].count)).toBe(1);
    });

    it('con { confirm: true }, borra transacciones/lotes/imports/caché', async () => {
      const res = await request(app).delete('/api/settings/data/transactions').send({ confirm: true });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await pool.query('SELECT COUNT(*) FROM transactions');
      expect(Number(check.rows[0].count)).toBe(0);
    });
  });

  describe('POST /bulk-set-costs', () => {
    it('rechaza si updates no es un array (antes: aceptaba cualquier cosa con .length)', async () => {
      const res = await request(app).post('/api/settings/bulk-set-costs').send({ updates: 'no-es-un-array' });
      expect(res.status).toBe(400);
    });

    it('rechaza si updates está vacío', async () => {
      const res = await request(app).post('/api/settings/bulk-set-costs').send({ updates: [] });
      expect(res.status).toBe(400);
    });

    it('rechaza si pricePerUnit no es number', async () => {
      const res = await request(app).post('/api/settings/bulk-set-costs').send({ updates: [{ id: 'x', pricePerUnit: '100' }] });
      expect(res.status).toBe(400);
    });

    it('aplica el precio y ejecuta FIFO con datos válidos', async () => {
      const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet bulk test', 'hardware') RETURNING id`);
      const tx = await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
         VALUES ('DEPOSIT_CRYPTO', NOW(), 'ETH', 2, 2, $1) RETURNING id`,
        [wallet.rows[0].id]
      );

      const res = await request(app)
        .post('/api/settings/bulk-set-costs')
        .send({ updates: [{ id: tx.rows[0].id, pricePerUnit: 2000 }] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.updated).toBe(1);
      expect(res.body.fifo.lotsCreated).toBeGreaterThanOrEqual(1);

      const updated = await pool.query('SELECT cost_amount FROM transactions WHERE id = $1', [tx.rows[0].id]);
      expect(Number(updated.rows[0].cost_amount)).toBe(4000);
    });
  });

  describe('GET /notifications', () => {
    it('devuelve un array (posiblemente vacío)', async () => {
      const res = await request(app).get('/api/settings/notifications');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /pending-deposits', () => {
    it('devuelve un array (posiblemente vacío)', async () => {
      const res = await request(app).get('/api/settings/pending-deposits');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /backup', () => {
    it('devuelve las 5 secciones esperadas', async () => {
      const res = await request(app).get('/api/settings/backup');
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(
        ['assets', 'config', 'exported_at', 'imports', 'transactions', 'version', 'wallets'].sort()
      );
    });
  });
});
