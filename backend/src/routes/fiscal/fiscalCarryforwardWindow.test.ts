import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';
import { madridYearMonth } from '../../modules/fiscal/madridTime';

// Carryforward desde el primer ejercicio con datos (#305). Antes solo se
// cargaban los 4 últimos y el actual: una pérdida de hace 5 años, que aún
// pudo compensar ganancias de hace 2, quedaba fuera. Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
const Y = madridYearMonth().year;

async function seed(year: number, gain: number) {
  const w = (await pool.query(`SELECT id FROM wallets LIMIT 1`)).rows[0]?.id
    ?? (await pool.query(`INSERT INTO wallets (name, type) VALUES ('W cf', 'hardware') RETURNING id`)).rows[0].id;
  const at = `${year}-06-15T10:00:00Z`;
  const tx = (await pool.query(`INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id) VALUES ('SELL', $1, 'BTC', 1, 1, $2) RETURNING id`, [at, w])).rows[0].id;
  const lot = (await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ('BTC', 1, 0, 0, 0, $1, '2010-01-01T00:00:00Z', $2, TRUE) RETURNING id`, [tx, w])).rows[0].id;
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, 1, 0, $3, $4, $5, $6)`, [lot, tx, Math.max(gain, 0), gain, gain >= 0 ? 'GAIN' : 'LOSS', at]);
}

describe('GET /api/fiscal/carryforward — ventana completa (#305)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    await seed(Y - 5, -100);   // pérdida fuera de la antigua ventana
    await seed(Y - 2, 40);     // ganancia que esa pérdida aún podía compensar (caduca en Y-1)
    await seed(Y, -10);
    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('incluye la pérdida antigua: compensa, caduca y no inflaría la base', async () => {
    const r = (await request(app).get('/api/fiscal/carryforward')).body;
    const old = r.origenes.find((o: { year: number }) => o.year === Y - 5);
    expect(old).toMatchObject({ original: 100, compensadoPatrim: 40, pendiente: 0, caducado: 60, caducaEn: Y - 1 });
    expect(r.detalle.find((d: { year: number }) => d.year === Y - 2)).toMatchObject({ compensadoPatrim: 40, netoDespues: 0 });
    expect(r.pendienteTotal).toBeCloseTo(10, 6);
    expect(r.detalle.at(-1).year).toBe(Y);
  });
});
