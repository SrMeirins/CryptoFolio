import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Ejercicio fiscal en hora de Madrid (#295). Datos sintéticos:
// - 2024-12-31T23:30Z = 1 ene 2025, 00:30 en Madrid → ejercicio 2025, enero.
// - 2024-06-30T22:30Z = 1 jul 2024, 00:30 en Madrid (verano, UTC+2) → julio.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

async function seedSale(asset: string, at: string, gain: number) {
  const buy = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('BUY', '2023-01-01T00:00:00Z', $1, 1, 1, $2) RETURNING id`, [asset, walletId],
  );
  const lot = await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ($1, 1, 0, 0, 0, $2, '2023-01-01T00:00:00Z', $3, TRUE) RETURNING id`, [asset, buy.rows[0].id, walletId],
  );
  const sell = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('SELL', $1, $2, 1, 1, $3) RETURNING id`, [at, asset, walletId],
  );
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, 1, 0, $3, $4, 'GAIN', $5)`, [lot.rows[0].id, sell.rows[0].id, gain, gain, at],
  );
}

describe('routes/fiscal — año y mes en hora de Madrid (#295)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet Madrid test', 'hardware') RETURNING id`)).rows[0].id;
    await seedSale('BTC', '2024-12-31T23:30:00Z', 100);
    await seedSale('ETH', '2024-06-30T22:30:00Z', 40);
    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('la venta de las 00:30 del 1 de enero cuenta en el año nuevo', async () => {
    expect((await request(app).get('/api/fiscal/years')).body).toEqual(expect.arrayContaining([2025, 2024]));
    const b2025 = (await request(app).get('/api/fiscal/2025/breakdown')).body as { asset: string; neto: number }[];
    const b2024 = (await request(app).get('/api/fiscal/2024/breakdown')).body as { asset: string; neto: number }[];
    expect(b2025.map(r => r.asset)).toEqual(['BTC']);
    expect(b2024.map(r => r.asset)).toEqual(['ETH']);
    const ev = (await request(app).get('/api/fiscal/2025/events')).body;
    expect(ev.fiscalEvents).toHaveLength(1);
    // La fecha mostrada y exportada es la de Madrid; la hora exacta va aparte.
    expect(ev.fiscalEvents[0]).toMatchObject({ fecha: '2025-01-01', fechaHora: '2024-12-31T23:30:00.000Z' });
  });

  it('el mes también es el de Madrid (enero y julio)', async () => {
    type Mensual = { meses: { mes: number; netoMes: number }[] };
    const m2025 = (await request(app).get('/api/fiscal/2025/monthly')).body as Mensual;
    const m2024 = (await request(app).get('/api/fiscal/2024/monthly')).body as Mensual;
    expect(m2025.meses.find(x => x.mes === 1)?.netoMes).toBeCloseTo(100, 2);
    expect(m2024.meses.find(x => x.mes === 7)?.netoMes).toBeCloseTo(40, 2);
    expect(m2024.meses.find(x => x.mes === 6)?.netoMes).toBe(0);
    expect(m2024.meses.find(x => x.mes === 12)?.netoMes).toBe(0);
  });

  it('la vista v_fiscal_year (/api/fifo/summary) usa el mismo ejercicio', async () => {
    const rows = (await request(app).get('/api/fifo/summary')).body as { fiscal_year: number; total_gain_loss_eur: string }[];
    const y2025 = rows.find(r => r.fiscal_year === 2025);
    expect(parseFloat(y2025!.total_gain_loss_eur)).toBeCloseTo(100, 2);
  });

  it('año con formato estricto: 400 para «2024abc» y «2024.5»', async () => {
    expect((await request(app).get('/api/fiscal/2024abc/breakdown')).status).toBe(400);
    expect((await request(app).get('/api/fiscal/2024.5/breakdown')).status).toBe(400);
    expect((await request(app).get('/api/fiscal/2008/breakdown')).status).toBe(400);
  });
});
