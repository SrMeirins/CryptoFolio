import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';
import { registerProvider } from '../modules/walletSync/providers/registry';
import type { BalanceProvider } from '../modules/walletSync/providers/types';
import { randomBytes } from 'crypto';

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;
let networkId: string;

describe('routes/wallets — sync y api-key', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    process.env.WALLET_SYNC_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    pool = new Pool({ connectionString: testDb.connectionString });

    const net = await pool.query(`SELECT id FROM networks WHERE name = 'XRP Ledger'`);
    networkId = net.rows[0].id;

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet API test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM balance_sync_log');
    await pool.query('DELETE FROM network_api_keys');
  });

  it('POST .../sync dispara la verificación y devuelve el resultado', async () => {
    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rApiTest') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 10 }) };
    registerProvider('XRP Ledger', fake);

    const res = await request(app).post(`/api/wallets/${walletId}/addresses/${addressId}/sync`);
    expect(res.status).toBe(200);
    expect(res.body[0].asset).toBe('XRP');
  });

  it('PUT/GET/DELETE api-key: nunca expone el valor cifrado', async () => {
    let res = await request(app).get(`/api/wallets/networks/${networkId}/api-key`);
    expect(res.body).toEqual({ network_id: networkId, has_key: false, updated_at: null });

    res = await request(app).put(`/api/wallets/networks/${networkId}/api-key`).send({ api_key: 'mi-key-secreta' });
    expect(res.status).toBe(200);

    res = await request(app).get(`/api/wallets/networks/${networkId}/api-key`);
    expect(res.body.has_key).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('mi-key-secreta');
    expect(Object.keys(res.body)).not.toContain('api_key_encrypted');

    res = await request(app).delete(`/api/wallets/networks/${networkId}/api-key`);
    expect(res.status).toBe(200);

    res = await request(app).get(`/api/wallets/networks/${networkId}/api-key`);
    expect(res.body.has_key).toBe(false);
  });

  it('GET /api/wallets expone sync_status agregado por dirección', async () => {
    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rApiTest2') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;
    await pool.query(
      `INSERT INTO balance_sync_log (wallet_address_id, asset, onchain_balance, expected_balance, discrepancy_pct, status)
       VALUES ($1, 'XRP', 5, 10, 0.5, 'discrepancy')`,
      [addressId]
    );

    const res = await request(app).get('/api/wallets');
    const wallet = res.body.find((w: { id: string }) => w.id === walletId);
    const addr = wallet.addresses.find((a: { id: string }) => a.id === addressId);
    expect(addr.sync_status).toBe('discrepancy');
    expect(addr.sync_details[0].asset).toBe('XRP');
  });
});
