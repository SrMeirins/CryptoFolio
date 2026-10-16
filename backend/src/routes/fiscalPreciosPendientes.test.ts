import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// #267: sin conexión con las fuentes de precios, las rutas fiscales responden
// dentro del tiempo máximo con datos parciales y la lista de precios pendientes.
// XRP tiene precio; ADA no llega nunca (fuente colgada); DOT no tiene datos en
// ninguna fuente (marca «sin precio» definitiva en caché).
const { priceMock } = vi.hoisted(() => ({ priceMock: vi.fn() }));
vi.mock('../modules/prices/binance', () => ({ getHistoricalPriceEur: priceMock }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

async function seedLot(asset: string, quantity: number) {
  const w = (await pool.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
  const tx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('BUY', '2024-01-10T10:00:00Z', $1, $2, $2, $3) RETURNING id`,
    [asset, quantity, w],
  );
  await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ($1, $2, $2, $2, 1, $3, '2024-01-10T10:00:00Z', $4, FALSE)`,
    [asset, quantity, tx.rows[0].id, w],
  );
}

describe('rutas fiscales con precios no disponibles (#267)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    process.env.FISCAL_PRICE_BUDGET_MS = '200';
    pool = new Pool({ connectionString: testDb.connectionString });
    await seedLot('XRP', 60_000);
    await seedLot('ADA', 1_000);
    await seedLot('DOT', 500);
    await pool.query(`INSERT INTO price_cache (asset, price_eur, price_date, source) VALUES ('DOT', -1, '2024-12-31', 'no_data')`);
    priceMock.mockImplementation(async (asset: string) => {
      if (asset === 'XRP') return 1;
      if (asset === 'ADA') return new Promise<number>(() => { /* nunca responde */ });
      return 0;
    });
    app = (await import('../app')).default;
  });

  afterAll(async () => {
    delete process.env.FISCAL_PRICE_BUDGET_MS;
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('modelo721 responde dentro del tiempo máximo con el mínimo y los precios pendientes', async () => {
    const t0 = Date.now();
    const res = await request(app).get('/api/fiscal/2024/modelo721');
    expect(Date.now() - t0).toBeLessThan(3_000);
    expect(res.status).toBe(200);
    expect(res.body.totalValorCustodia).toBeCloseTo(60_000, 2);
    expect(res.body.preciosPendientes).toEqual(['ADA']);   // DOT es definitivo: no pendiente
    expect(res.body.incompleto).toBe(true);
    // El mínimo ya supera el umbral: la obligación es segura aunque falten precios.
    expect(res.body.superaUmbral).toBe(true);
    const ada = res.body.activos.find((a: { asset: string }) => a.asset === 'ADA');
    const dot = res.body.activos.find((a: { asset: string }) => a.asset === 'DOT');
    expect(ada).toMatchObject({ sinPrecio: true, valorEur: 0 });
    expect(dot).toMatchObject({ sinPrecio: true, valorEur: 0 });
  });

  it('summary también marca el valor como incompleto', async () => {
    const res = await request(app).get('/api/fiscal/2024/summary');
    expect(res.status).toBe(200);
    expect(res.body.preciosPendientes).toEqual(['ADA']);
    expect(res.body.valorIncompleto).toBe(true);
  });

  it('con todos los precios, nada pendiente', async () => {
    priceMock.mockImplementation(async (asset: string) => (asset === 'DOT' ? 0 : 1));
    const res = await request(app).get('/api/fiscal/2024/modelo721');
    expect(res.body.preciosPendientes).toEqual([]);
    expect(res.body.incompleto).toBe(false);
  });
});
