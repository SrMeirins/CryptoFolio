import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';
import { localYearMonth } from '../../modules/time/localTime';
import { DEFAULT_TIMEZONE } from '../../modules/time/appTimezone';

// Planificador de fin de año (#307). Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
const Y = localYearMonth(DEFAULT_TIMEZONE).year;
let walletId: string;

async function tx(op: string, at: string, asset: string) {
  return (await pool.query(`INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id) VALUES ($1, $2, $3, 1, 1, $4) RETURNING id`, [op, at, asset, walletId])).rows[0].id as string;
}

describe('/api/fiscal/planificador (#307)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('W plan', 'hardware') RETURNING id`)).rows[0].id;
    // Pérdida de 300 el año pasado, aún pendiente.
    const sell = await tx('SELL', `${Y - 1}-06-15T10:00:00Z`, 'ADA');
    const closed = (await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
       VALUES ('ADA', 1, 0, 0, 0, $1, '2020-01-01T00:00:00Z', $2, TRUE) RETURNING id`, [sell, walletId])).rows[0].id;
    await pool.query(
      `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
       VALUES ($1, $2, 1, 300, 0, -300, 'LOSS', $3)`, [closed, sell, `${Y - 1}-06-15T10:00:00Z`]);
    // Dos lotes abiertos de XRP en orden FIFO, el segundo comprado hace poco.
    const b1 = await tx('BUY', '2024-01-01T10:00:00Z', 'XRP');
    const b2 = await tx('BUY', new Date(Date.now() - 10 * 86_400_000).toISOString(), 'XRP');
    await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('XRP', 100, 100, 200, 2, $1, '2024-01-01T10:00:00Z', $3), ('XRP', 50, 50, 25, 0.5, $2, now() - INTERVAL '10 days', $3)`, [b1, b2, walletId]);
    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('GET: contexto, colchón, lotes en orden FIFO y compras recientes', async () => {
    const r = (await request(app).get('/api/fiscal/planificador')).body;
    expect(r).toMatchObject({ year: Y, netoAnio: 0, cuotaActual: 0, colchon: 300, pendienteVigente: 300 });
    expect(r.lotes.map((l: { asset: string; unitCost: number }) => `${l.asset}@${l.unitCost}`)).toEqual(['XRP@2', 'XRP@0.5']);
    expect(Object.keys(r.comprasRecientes)).toEqual(['XRP']);
  });

  it('POST cuotas: el colchón no tributa y lo que lo supera sí', async () => {
    const r = (await request(app).post('/api/fiscal/planificador/cuotas').send({ ganancias: [300, 1300, -50] })).body;
    expect(r.cuotaBase).toBe(0);
    expect(r.cuotas).toEqual([0, 190, 0]);
  });

  it('POST cuotas valida la entrada', async () => {
    expect((await request(app).post('/api/fiscal/planificador/cuotas').send({ ganancias: [] })).status).toBe(400);
    expect((await request(app).post('/api/fiscal/planificador/cuotas').send({ ganancias: Array(201).fill(1) })).status).toBe(400);
    expect((await request(app).post('/api/fiscal/planificador/cuotas').send({ ganancias: ['1'] })).status).toBe(400);
    expect((await request(app).post('/api/fiscal/planificador/cuotas').send({ ganancias: [1], x: 1 })).status).toBe(400);
  });
});
