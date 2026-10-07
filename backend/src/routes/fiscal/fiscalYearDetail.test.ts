import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// /:year/breakdown y /:year/monthly no tenían NINGÚN test propio.
// (summary/events/modelo721 ya están cubiertos en fiscal*.test.ts a nivel
// de routes/, sin cambios en este turno).
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

async function seedConsumption(asset: string, month: number, gainLoss: number) {
  const buyTx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('BUY', '2023-01-01T00:00:00Z', $1, 1, 1, $2) RETURNING id`,
    [asset, walletId]
  );
  const lot = await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ($1, 1, 1, 0, 0, $2, '2023-01-01T00:00:00Z', $3, FALSE) RETURNING id`,
    [asset, buyTx.rows[0].id, walletId]
  );
  const sellTx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('SELL', $1, $2, 1, 1, $3) RETURNING id`,
    [`2023-${String(month).padStart(2, '0')}-15T00:00:00Z`, asset, walletId]
  );
  // proceeds_eur (dominio eur_amount) nunca es negativo — la pérdida/ganancia
  // vive en gain_loss_eur. Para una pérdida simulada, proceeds_eur = 0.
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, 1, 0, $3, $4, 'GAIN', $5)`,
    [lot.rows[0].id, sellTx.rows[0].id, Math.max(gainLoss, 0), gainLoss, `2023-${String(month).padStart(2, '0')}-15T00:00:00Z`]
  );
  await pool.query(`UPDATE fifo_lots SET quantity_remaining = 0, is_closed = TRUE WHERE id = $1`, [lot.rows[0].id]);
}

describe('routes/fiscal — breakdown y monthly', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet detail test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    await seedConsumption('BTC', 1, 50);
    await seedConsumption('ETH', 3, -20);

    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('GET /:year/breakdown agrega ganancias/pérdidas por activo', async () => {
    const res = await request(app).get('/api/fiscal/2023/breakdown');
    expect(res.status).toBe(200);
    const btc = res.body.find((r: { asset: string }) => r.asset === 'BTC');
    const eth = res.body.find((r: { asset: string }) => r.asset === 'ETH');
    expect(btc.neto).toBeCloseTo(50, 2);
    expect(eth.neto).toBeCloseTo(-20, 2);
  });

  it('GET /:year/breakdown con año inválido devuelve 400', async () => {
    const res = await request(app).get('/api/fiscal/abc/breakdown');
    expect(res.status).toBe(400);
  });

  it('GET /:year/monthly acumula correctamente mes a mes', async () => {
    const res = await request(app).get('/api/fiscal/2023/monthly');
    expect(res.status).toBe(200);
    const enero = res.body.meses.find((m: { mes: number }) => m.mes === 1);
    const marzo = res.body.meses.find((m: { mes: number }) => m.mes === 3);
    expect(enero.netoMes).toBeCloseTo(50, 2);
    expect(enero.acumulado).toBeCloseTo(50, 2);
    expect(marzo.netoMes).toBeCloseTo(-20, 2);
    expect(marzo.acumulado).toBeCloseTo(30, 2);
    // Año pasado (no en curso): no hay proyección
    expect(res.body.proyeccionFinAnio).toBeNull();
  });
});
