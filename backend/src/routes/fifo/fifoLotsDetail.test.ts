import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Lotes FIFO abiertos de un activo (#272).
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

async function seedLot(walletName: string, openedAt: string, qty: number, remaining: number, price: number, closed = false) {
  const w = (await pool.query(`SELECT id FROM wallets WHERE name = $1`, [walletName])).rows[0].id;
  const tx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('BUY', $1, 'XRP', $2, $2, $3) RETURNING id`, [openedAt, qty, w],
  );
  await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ('XRP', $1, $2, $3, $4, $5, $6, $7, $8)`,
    [qty, remaining, remaining * price, price, tx.rows[0].id, openedAt, w, closed],
  );
}

describe('GET /api/v1/fifo/lots/:asset (#272)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    await seedLot('Binance Spot', '2024-03-01T10:00:00Z', 100, 40, 0.6);    // parcialmente vendido
    await seedLot('Binance Spot', '2024-01-01T10:00:00Z', 50, 50, 0.5);     // el más antiguo: se vendería primero
    await seedLot('Binance Funding', '2024-02-01T10:00:00Z', 10, 10, 0.55);
    await seedLot('Binance Spot', '2023-06-01T10:00:00Z', 20, 0, 0.4, true); // cerrado: no aparece
    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('devuelve los lotes abiertos en orden FIFO por wallet, sin los cerrados', async () => {
    const res = await request(app).get('/api/v1/fifo/lots/xrp');
    expect(res.status).toBe(200);
    expect(res.body.asset).toBe('XRP');
    expect(res.body.lots.map((l: { wallet_name: string; quantity_remaining: string }) => `${l.wallet_name}:${parseFloat(l.quantity_remaining)}`))
      .toEqual(['Binance Funding:10', 'Binance Spot:50', 'Binance Spot:40']);
    expect(res.body.lots[1]).toMatchObject({ source_type: 'BUY', wallet_kind: 'exchange' });
  });

  it('la suma de los lotes coincide con la fila agregada de /api/fifo/lots', async () => {
    const detail = (await request(app).get('/api/v1/fifo/lots/XRP')).body.lots as Array<{ quantity_remaining: string; cost_basis_eur: string }>;
    const agg = ((await request(app).get('/api/fifo/lots')).body as Array<{ asset: string; quantity: string; cost_basis_eur: string }>).filter(r => r.asset === 'XRP');
    const sum = (xs: string[]) => xs.reduce((s, x) => s + parseFloat(x), 0);
    expect(sum(detail.map(l => l.quantity_remaining))).toBeCloseTo(sum(agg.map(r => r.quantity)), 9);
    expect(sum(detail.map(l => l.cost_basis_eur))).toBeCloseTo(sum(agg.map(r => r.cost_basis_eur)), 9);
  });

  it('400 para un símbolo inválido; lista vacía para un activo sin lotes', async () => {
    expect((await request(app).get('/api/v1/fifo/lots/..%2Fetc')).status).toBe(400);
    expect((await request(app).get('/api/v1/fifo/lots/' + 'A'.repeat(30))).status).toBe(400);
    const none = await request(app).get('/api/v1/fifo/lots/ADA');
    expect(none.status).toBe(200);
    expect(none.body.lots).toEqual([]);
  });
});
