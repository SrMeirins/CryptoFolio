import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

describe('POST /api/fiscal/simulate-sale — tramo IRPF > 300.000€', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(
      `INSERT INTO wallets (name, type) VALUES ('Wallet test fiscal', 'hardware') RETURNING id`
    );
    walletId = wallet.rows[0].id;

    // Lote con coste 0 para que toda la venta sea ganancia neta — simplifica
    // el cálculo esperado del tramo.
    const tx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('BUY', NOW(), 'BTC', 100, 100, $1) RETURNING id`,
      [walletId]
    );
    await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
       VALUES ('BTC', 100, 100, 0, 0, $1, NOW(), $2, FALSE)`,
      [tx.rows[0].id, walletId]
    );

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  // Ley 7/2024: el último tramo de la base del ahorro (>300.000€) subió del
  // 28% al 30% desde el 1-ene-2025. Una venta que genera 310.000€ de ganancia
  // neta debe aplicar 30% sobre los 10.000€ que exceden los 300.000€, no 28%.
  it('aplica 30% (no 28%) sobre el exceso de 300.000€', async () => {
    const res = await request(app)
      .post('/api/fiscal/simulate-sale')
      .send({ asset: 'BTC', quantity: 1, priceEur: 310_000 });

    expect(res.status).toBe(200);
    // 6000*.19 + 44000*.21 + 150000*.23 + 100000*.27 + 10000*.30 = 74880
    // (con el bug del 28%, el resultado sería 74680)
    expect(res.body.irpfEstimate).toBeCloseTo(74880, 2);
  });
});
