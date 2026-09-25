import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Precio fijo 1€ por unidad: el valor de cada lote = su cantidad, sin llamar
// a CoinGecko/Binance en el test.
vi.mock('../modules/prices/binance', () => ({
  getHistoricalPriceEur: vi.fn(async () => 1),
}));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

async function seedLot(walletName: string, kind: 'exchange' | 'hardware', quantity: number) {
  const w = await pool.query(
    `INSERT INTO wallets (name, type) VALUES ($1, $2) RETURNING id`, [walletName, kind]
  );
  const tx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('BUY', '2024-01-10T10:00:00Z', 'XRP', $1, $1, $2) RETURNING id`,
    [quantity, w.rows[0].id]
  );
  await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ('XRP', $1, $1, $1, 1, $2, '2024-01-10T10:00:00Z', $3, FALSE)`,
    [quantity, tx.rows[0].id, w.rows[0].id]
  );
}

describe('GET /api/fiscal/:year/modelo721 — solo custodia de terceros', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    await seedLot('Exchange test', 'exchange', 30_000);
    await seedLot('Hardware test', 'hardware', 25_000);
    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  // 30.000€ en exchange + 25.000€ en autocustodia = 55.000€ en total (> 50.000€),
  // pero solo los 30.000€ de exchange computan para el 721: sin obligación.
  it('el umbral se evalúa solo sobre wallets tipo exchange, no sobre autocustodia', async () => {
    const res = await request(app).get('/api/fiscal/2024/modelo721');
    expect(res.status).toBe(200);
    expect(res.body.totalValor).toBeCloseTo(55_000, 2);
    expect(res.body.totalValorCustodia).toBeCloseTo(30_000, 2);
    expect(res.body.superaUmbral).toBe(false);
  });

  it('/summary también usa solo custodia de terceros para superaUmbral721', async () => {
    const res = await request(app).get('/api/fiscal/2024/summary');
    expect(res.status).toBe(200);
    expect(res.body.valorTotal31Dic).toBeCloseTo(30_000, 2);
    expect(res.body.superaUmbral721).toBe(false);
  });
});
