import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';
import { MAX_LENGTH_LONG, MAX_LENGTH_SHORT } from '../modules/validation/textLength';

// Verifica que los endpoints de escritura de campos de texto libre rechacen
// con 400 un valor que exceda el límite de longitud, y que ese valor NUNCA
// llegue a guardarse en BD — defensa en profundidad adicional a la
// sanitización de CSV Formula Injection del export del frontend.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;
let networkId: string;

describe('límites de longitud en campos de texto libre del backend', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const net = await pool.query(`SELECT id FROM networks WHERE name = 'XRP Ledger'`);
    networkId = net.rows[0].id;

    const wallet = await pool.query(
      `INSERT INTO wallets (name, type) VALUES ('Wallet longitud test', 'hardware') RETURNING id`
    );
    walletId = wallet.rows[0].id;

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  // ── POST /api/wallets ─────────────────────────────────────────────────
  describe('POST /api/wallets', () => {
    it('acepta name/notes dentro del límite', async () => {
      const res = await request(app).post('/api/wallets').send({
        name: 'a'.repeat(MAX_LENGTH_SHORT),
        type: 'hardware',
        notes: 'b'.repeat(MAX_LENGTH_LONG),
      });
      expect(res.status).toBe(201);
    });

    it('rechaza name que excede el límite corto y no lo guarda', async () => {
      const tooLong = 'a'.repeat(MAX_LENGTH_SHORT + 1);
      const res = await request(app).post('/api/wallets').send({ name: tooLong, type: 'hardware' });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT id FROM wallets WHERE name = $1', [tooLong]);
      expect(check.rows).toHaveLength(0);
    });

    it('rechaza notes que excede el límite largo y no lo guarda', async () => {
      const tooLong = 'b'.repeat(MAX_LENGTH_LONG + 1);
      const res = await request(app).post('/api/wallets').send({ name: 'Wallet notes test', type: 'hardware', notes: tooLong });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT id FROM wallets WHERE notes = $1', [tooLong]);
      expect(check.rows).toHaveLength(0);
    });
  });

  // ── PUT /api/wallets/:id ──────────────────────────────────────────────
  describe('PUT /api/wallets/:id', () => {
    it('rechaza name que excede el límite y no lo guarda', async () => {
      const tooLong = 'c'.repeat(MAX_LENGTH_SHORT + 1);
      const res = await request(app).put(`/api/wallets/${walletId}`).send({ name: tooLong });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT name FROM wallets WHERE id = $1', [walletId]);
      expect(check.rows[0].name).not.toBe(tooLong);
    });
  });

  // ── POST /api/wallets/networks ────────────────────────────────────────
  describe('POST /api/wallets/networks', () => {
    it('rechaza name que excede el límite y no lo guarda', async () => {
      const tooLong = 'd'.repeat(MAX_LENGTH_SHORT + 1);
      const res = await request(app).post('/api/wallets/networks').send({ name: tooLong, native_asset: 'FOO' });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT id FROM networks WHERE name = $1', [tooLong]);
      expect(check.rows).toHaveLength(0);
    });

    it('acepta name dentro del límite', async () => {
      const res = await request(app).post('/api/wallets/networks').send({ name: 'Red de test', native_asset: 'FOO' });
      expect(res.status).toBe(201);
    });
  });

  // ── POST /api/wallets/:id/addresses ───────────────────────────────────
  describe('POST /api/wallets/:id/addresses', () => {
    it('rechaza custom_network que excede el límite y no lo guarda', async () => {
      const tooLong = 'e'.repeat(MAX_LENGTH_SHORT + 1);
      const res = await request(app).post(`/api/wallets/${walletId}/addresses`).send({ custom_network: tooLong });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT id FROM wallet_addresses WHERE custom_network = $1', [tooLong]);
      expect(check.rows).toHaveLength(0);
    });

    it('rechaza custom_explorer_url que excede el límite y no lo guarda', async () => {
      const tooLong = 'https://example.com/' + 'x'.repeat(MAX_LENGTH_LONG);
      const res = await request(app)
        .post(`/api/wallets/${walletId}/addresses`)
        .send({ network_id: networkId, custom_explorer_url: tooLong });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT id FROM wallet_addresses WHERE custom_explorer_url = $1', [tooLong]);
      expect(check.rows).toHaveLength(0);
    });

    it('acepta custom_network dentro del límite', async () => {
      const res = await request(app)
        .post(`/api/wallets/${walletId}/addresses`)
        .send({ custom_network: 'Red personalizada', address: 'addr1' });
      expect(res.status).toBe(201);
    });
  });

  // ── PUT /api/wallets/:id/addresses/:addressId ─────────────────────────
  describe('PUT /api/wallets/:id/addresses/:addressId', () => {
    it('rechaza custom_network que excede el límite y no lo guarda', async () => {
      const addr = await pool.query(
        `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'addr-put-test') RETURNING id`,
        [walletId, networkId]
      );
      const addressId = addr.rows[0].id;
      const tooLong = 'f'.repeat(MAX_LENGTH_SHORT + 1);

      const res = await request(app)
        .put(`/api/wallets/${walletId}/addresses/${addressId}`)
        .send({ custom_network: tooLong });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT custom_network FROM wallet_addresses WHERE id = $1', [addressId]);
      expect(check.rows[0].custom_network).not.toBe(tooLong);
    });
  });

  // ── POST /api/transactions/manual ─────────────────────────────────────
  describe('POST /api/transactions/manual', () => {
    it('rechaza notes que excede el límite y no lo guarda', async () => {
      const tooLong = 'g'.repeat(MAX_LENGTH_LONG + 1);
      const res = await request(app).post('/api/transactions/manual').send({
        operationType: 'BUY',
        asset: 'BTC',
        amount: '1',
        wallet_id: walletId,
        timestamp: '2026-01-01T00:00:00.000Z',
        notes: tooLong,
      });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT id FROM transactions WHERE notes = $1', [tooLong]);
      expect(check.rows).toHaveLength(0);
    });

    it('acepta notes dentro del límite', async () => {
      const res = await request(app).post('/api/transactions/manual').send({
        operationType: 'BUY',
        asset: 'BTC',
        amount: '1',
        wallet_id: walletId,
        timestamp: '2026-01-01T00:00:00.000Z',
        notes: 'h'.repeat(MAX_LENGTH_LONG),
      });
      expect(res.status).toBe(200);
    });
  });

  // ── PUT /api/transactions/:id ──────────────────────────────────────────
  describe('PUT /api/transactions/:id', () => {
    it('rechaza notes que excede el límite y no lo guarda', async () => {
      const tx = await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, manually_added)
         VALUES ('BUY', NOW(), 'BTC', 1, 1, $1, true) RETURNING id`,
        [walletId]
      );
      const txId = tx.rows[0].id;
      const tooLong = 'i'.repeat(MAX_LENGTH_LONG + 1);

      const res = await request(app).put(`/api/transactions/${txId}`).send({
        operationType: 'BUY',
        asset: 'BTC',
        amount: '1',
        wallet_id: walletId,
        timestamp: '2026-01-01T00:00:00.000Z',
        notes: tooLong,
      });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT notes FROM transactions WHERE id = $1', [txId]);
      expect(check.rows[0].notes).not.toBe(tooLong);
    });
  });

  // ── POST /api/settings/assets ─────────────────────────────────────────
  describe('POST /api/settings/assets', () => {
    it('rechaza name que excede el límite y no lo guarda', async () => {
      const tooLong = 'j'.repeat(MAX_LENGTH_SHORT + 1);
      const res = await request(app).post('/api/settings/assets').send({ symbol: 'ZZZ', name: tooLong });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT symbol FROM asset_metadata WHERE symbol = $1', ['ZZZ']);
      expect(check.rows).toHaveLength(0);
    });

    it('acepta name dentro del límite', async () => {
      const res = await request(app).post('/api/settings/assets').send({ symbol: 'YYY', name: 'Nombre válido' });
      expect(res.status).toBe(200);
    });
  });

  // ── PUT /api/settings/assets/:symbol ───────────────────────────────────
  describe('PUT /api/settings/assets/:symbol', () => {
    it('rechaza name que excede el límite y no lo guarda', async () => {
      await pool.query(
        `INSERT INTO asset_metadata (symbol, name, price_source, auto_detected) VALUES ('XXX', 'Original', 'unknown', FALSE)`
      );
      const tooLong = 'k'.repeat(MAX_LENGTH_SHORT + 1);

      const res = await request(app).put('/api/settings/assets/XXX').send({ name: tooLong });
      expect(res.status).toBe(400);

      const check = await pool.query('SELECT name FROM asset_metadata WHERE symbol = $1', ['XXX']);
      expect(check.rows[0].name).toBe('Original');
    });
  });
});
