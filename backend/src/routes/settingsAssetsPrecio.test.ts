import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Activos sin precio (#337): la API de activos trae el precio en vivo, su fuente
// y si está en cartera; la campana avisa de los que están en cartera sin precio.
// Sin feed en vivo en los tests: ningún activo tiene precio. Datos sintéticos.
describe('activos sin precio (#337)', () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let app: import('express').Express;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    await pool.query(`INSERT INTO asset_metadata (symbol, name, is_stablecoin, price_source) VALUES ('SINTX', 'Sintético', FALSE, 'coingecko')`);
    const w = (await pool.query(`SELECT id FROM wallets LIMIT 1`)).rows[0].id;
    const tx = (await pool.query(`INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id) VALUES ('BUY', now(), 'SINTX', 5, 5, $1) RETURNING id`, [w])).rows[0].id;
    await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
       VALUES ('SINTX', 5, 5, 5, 1, $1, now(), $2, FALSE)`, [tx, w]);
    app = (await import('../app')).default;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('la API de activos indica precio en vivo, fuente y si está en cartera', async () => {
    const assets = (await request(app).get('/api/settings/assets')).body as Array<{ symbol: string; en_cartera: boolean; precio_actual: number | null; fuente_actual: string | null }>;
    expect(assets.find(a => a.symbol === 'SINTX')).toMatchObject({ en_cartera: true, precio_actual: null, fuente_actual: null });
    expect(assets.find(a => a.symbol === 'BTC')).toMatchObject({ en_cartera: false });
  });

  it('la campana avisa de los activos en cartera sin precio aunque tengan fuente configurada', async () => {
    const avisos = (await request(app).get('/api/settings/notifications')).body as Array<{ id: string; message: string }>;
    expect(avisos.find(n => n.id === 'no-price')?.message).toMatch(/SINTX/);
  });
});
