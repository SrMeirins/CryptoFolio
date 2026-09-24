import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';
import { registerProvider } from './providers/registry';
import type { BalanceProvider } from './providers/types';

let testDb: TestDatabase;
let pool: Pool;
let walletId: string;
let networkId: string;

// walletSync.ts lee DATABASE_URL vía ../../db/client al importarse — hay que
// fijarla antes del primer import dinámico para que apunte a la BD de test.
async function loadWalletSyncWithTestDb() {
  process.env.DATABASE_URL = testDb.connectionString;
  const mod = await import('./walletSync');
  return mod;
}

async function insertOpenLot(asset: string, quantity: number, costBasisEur: number) {
  const tx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('BUY', NOW(), $1, $2, $2, $3) RETURNING id`,
    [asset, quantity, walletId]
  );
  await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ($1, $2, $2, $3, $3, $4, NOW(), $5, FALSE)`,
    [asset, quantity, costBasisEur / quantity, tx.rows[0].id, walletId]
  );
}

describe('walletSync', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });

    const net = await pool.query(`SELECT id FROM networks WHERE name = 'XRP Ledger'`);
    networkId = net.rows[0].id;

    const wallet = await pool.query(
      `INSERT INTO wallets (name, type) VALUES ('Wallet de test', 'hardware') RETURNING id`
    );
    walletId = wallet.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM balance_sync_log');
    await pool.query('DELETE FROM fifo_lots');
    await pool.query('DELETE FROM transactions');
  });

  it('status ok cuando la diferencia está por debajo del 0.5%', async () => {
    const { syncWalletAddress } = await loadWalletSyncWithTestDb();

    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rTest1') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    await insertOpenLot('XRP', 1000, 500);

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 1000.5 }) };
    registerProvider('XRP Ledger', fake);

    const results = await syncWalletAddress(addressId);
    const xrpResult = results.find(r => r.asset === 'XRP')!;
    expect(xrpResult.status).toBe('ok');
    expect(xrpResult.onchainBalance).toBe(1000.5);
  });

  it('status discrepancy cuando la diferencia supera el 0.5%', async () => {
    const { syncWalletAddress } = await loadWalletSyncWithTestDb();

    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rTest2') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    await insertOpenLot('XRP', 1000, 500);

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 900 }) }; // -10%
    registerProvider('XRP Ledger', fake);

    const results = await syncWalletAddress(addressId);
    const xrpResult = results.find(r => r.asset === 'XRP')!;
    expect(xrpResult.status).toBe('discrepancy');
    expect(xrpResult.discrepancyPct).toBeCloseTo(0.1, 2);
  });

  it('status error si el proveedor falla, sin lanzar excepción', async () => {
    const { syncWalletAddress } = await loadWalletSyncWithTestDb();

    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rTest3') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: false, error: 'timeout' }) };
    registerProvider('XRP Ledger', fake);

    const results = await syncWalletAddress(addressId);
    expect(results[0].status).toBe('error');
  });

  it('escribe el resultado en balance_sync_log y actualiza last_known_balance/last_sync_at del activo nativo', async () => {
    const { syncWalletAddress } = await loadWalletSyncWithTestDb();

    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rTest4') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 42 }) };
    registerProvider('XRP Ledger', fake);

    await syncWalletAddress(addressId);

    const log = await pool.query(`SELECT * FROM balance_sync_log WHERE wallet_address_id = $1`, [addressId]);
    expect(log.rows.length).toBe(1);
    expect(Number(log.rows[0].onchain_balance)).toBe(42);

    const addr = await pool.query(`SELECT last_known_balance, last_sync_at FROM wallet_addresses WHERE id = $1`, [addressId]);
    expect(Number(addr.rows[0].last_known_balance)).toBe(42);
    expect(addr.rows[0].last_sync_at).not.toBeNull();
  });

  it('sin lotes abiertos (expected=0): cualquier saldo on-chain por encima del polvo cuenta como discrepancia', async () => {
    const { syncWalletAddress } = await loadWalletSyncWithTestDb();

    const addrRes = await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, 'rTest5') RETURNING id`,
      [walletId, networkId]
    );
    const addressId = addrRes.rows[0].id;

    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 5 }) };
    registerProvider('XRP Ledger', fake);

    const results = await syncWalletAddress(addressId);
    expect(results[0].status).toBe('discrepancy');
  });
});
