import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';
// clampDay viene de un módulo sin BD: importar el router aquí cargaría
// db/client antes de fijar DATABASE_URL y leería la base de desarrollo.
import { clampDay } from '../../modules/fiscal/madridTime';

// Neto de un ejercicio hasta una fecha de Madrid (#297). Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

async function seedSale(at: string, gain: number) {
  const tx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('SELL', $1, 'BTC', 1, 1, $2) RETURNING id`, [at, walletId],
  );
  const lot = await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ('BTC', 1, 0, 0, 0, $1, '2023-01-01T00:00:00Z', $2, TRUE) RETURNING id`, [tx.rows[0].id, walletId],
  );
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, 1, 0, $3, $4, $5, $6)`,
    [lot.rows[0].id, tx.rows[0].id, Math.max(gain, 0), gain, gain >= 0 ? 'GAIN' : 'LOSS', at],
  );
}

describe('GET /api/fiscal/:year/neto-hasta (#297)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet periodo', 'hardware') RETURNING id`)).rows[0].id;
    await seedSale('2025-03-10T10:00:00Z', 100);
    await seedSale('2025-06-14T21:30:00Z', -30);   // 14 jun 23:30 en Madrid: entra hasta el 14
    await seedSale('2025-06-14T22:30:00Z', 50);    // 15 jun 00:30 en Madrid: no entra hasta el 14
    await seedSale('2025-11-01T10:00:00Z', 500);
    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('suma hasta el día indicado, incluido, en hora de Madrid', async () => {
    const r = await request(app).get('/api/fiscal/2025/neto-hasta?hasta=06-14');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ year: 2025, hasta: '2025-06-14', ganancias: 100, perdidas: -30, neto: 70, operaciones: 2 });
    expect((await request(app).get('/api/fiscal/2025/neto-hasta?hasta=06-15')).body.neto).toBe(120);
    expect((await request(app).get('/api/fiscal/2025/neto-hasta?hasta=12-31')).body.neto).toBe(620);
  });

  it('valida el año y la fecha', async () => {
    expect((await request(app).get('/api/fiscal/2025/neto-hasta')).status).toBe(400);
    expect((await request(app).get('/api/fiscal/2025/neto-hasta?hasta=13-01')).status).toBe(400);
    expect((await request(app).get('/api/fiscal/2025/neto-hasta?hasta=6-1')).status).toBe(400);
    expect((await request(app).get('/api/fiscal/2025/neto-hasta?hasta=06-14&x=1')).status).toBe(400);
    expect((await request(app).get('/api/fiscal/abcd/neto-hasta?hasta=06-14')).status).toBe(400);
  });

  it('el 29 de febrero en un año no bisiesto pasa a ser el 28', async () => {
    expect(clampDay(2025, 2, 29)).toBe(28);
    expect(clampDay(2024, 2, 29)).toBe(29);
    expect(clampDay(2025, 4, 31)).toBe(30);
    expect((await request(app).get('/api/fiscal/2025/neto-hasta?hasta=02-29')).body.hasta).toBe('2025-02-28');
  });
});
