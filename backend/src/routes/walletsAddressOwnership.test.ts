import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';
import { registerProvider } from '../modules/walletSync/providers/registry';
import type { BalanceProvider } from '../modules/walletSync/providers/types';

// Bug real confirmado en el inventario de Nivel 10: PUT/DELETE
// /:id/addresses/:addressId y POST /:walletId/addresses/:addressId/sync
// filtraban solo por addressId, ignorando por completo el :id/:walletId del
// path — se podía editar/borrar/sincronizar la dirección de OTRA wallet
// pasando cualquier id ajeno. Este test fija el comportamiento corregido:
// 404 cuando el addressId no pertenece a la wallet del path.
describe('routes/wallets — la dirección debe pertenecer a la wallet del path', () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let app: import('express').Express;
  let walletA: string;
  let walletB: string;
  let addressOfWalletA: string;
  let networkId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const net = await pool.query(`SELECT id FROM networks WHERE name = 'Ethereum'`);
    networkId = net.rows[0].id;

    const wA = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet A ownership test', 'hardware') RETURNING id`);
    walletA = wA.rows[0].id;
    const wB = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet B ownership test', 'hardware') RETURNING id`);
    walletB = wB.rows[0].id;

    const addr = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, '0xownershiptest') RETURNING id`,
      [walletA, networkId]
    );
    addressOfWalletA = addr.rows[0].id;

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('PUT con el addressId de otra wallet devuelve 404 y no modifica la dirección', async () => {
    const res = await request(app)
      .put(`/api/wallets/${walletB}/addresses/${addressOfWalletA}`)
      .send({ address: '0xhijacked' });

    expect(res.status).toBe(404);

    const check = await pool.query('SELECT address FROM wallet_addresses WHERE id = $1', [addressOfWalletA]);
    expect(check.rows[0].address).toBe('0xownershiptest');
  });

  it('PUT con el addressId y el wallet_id correctos sí actualiza (200)', async () => {
    const res = await request(app)
      .put(`/api/wallets/${walletA}/addresses/${addressOfWalletA}`)
      .send({ address: '0xupdated' });

    expect(res.status).toBe(200);
    const check = await pool.query('SELECT address FROM wallet_addresses WHERE id = $1', [addressOfWalletA]);
    expect(check.rows[0].address).toBe('0xupdated');
  });

  it('DELETE con el addressId de otra wallet devuelve 404 y no borra la dirección', async () => {
    const res = await request(app).delete(`/api/wallets/${walletB}/addresses/${addressOfWalletA}`);
    expect(res.status).toBe(404);

    const check = await pool.query('SELECT id FROM wallet_addresses WHERE id = $1', [addressOfWalletA]);
    expect(check.rows).toHaveLength(1);
  });

  it('POST .../sync con el addressId de otra wallet devuelve 404 y no dispara el sync', async () => {
    let called = false;
    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => { called = true; return { ok: true, balance: 1 }; } };
    registerProvider('Ethereum', fake);

    const res = await request(app).post(`/api/wallets/${walletB}/addresses/${addressOfWalletA}/sync`);

    expect(res.status).toBe(404);
    expect(called).toBe(false);
  });

  it('POST .../sync con el walletId correcto sí dispara el sync (200)', async () => {
    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 2 }) };
    registerProvider('Ethereum', fake);

    const res = await request(app).post(`/api/wallets/${walletA}/addresses/${addressOfWalletA}/sync`);

    expect(res.status).toBe(200);
  });
});
