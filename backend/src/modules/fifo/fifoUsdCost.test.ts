import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Coste en USD por lote (#174): tipo USD por EUR de la apertura (1 USDT = 0,80 €
// → 1,25 USD por EUR), heredado en transferencias y proporcional en consumos.
vi.mock('../prices/binance', () => ({
  getHistoricalPriceEur: vi.fn((asset: string) => Promise.resolve(asset === 'USDT' ? 0.8 : 100)),
}));

let testDb: TestDatabase;
let db: typeof import('../../db/client')['db'];
let pool: typeof import('../../db/client')['pool'];
let spot: string;
let external: string;

async function tx(operation_type: string, timestamp: string, asset: string, amount: number,
  extra: Partial<{ cost_asset: string; cost_amount: number; destination_wallet_id: string }> = {}) {
  await db.query(
    `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id, destination_wallet_id, account)
     VALUES ($1, $2::operation_type, $3, $4, $5, $5, $6, $7, $8, $9, 'Spot')`,
    [randomUUID(), operation_type, timestamp, asset, amount, extra.cost_asset ?? null, extra.cost_amount ?? null, spot, extra.destination_wallet_id ?? null],
  );
}

const usdCost = async (asset: string, wallet: string) => Number((await db.query(
  `SELECT COALESCE(SUM(cost_basis_eur * usd_per_eur), 0)::float AS usd FROM fifo_lots
   WHERE asset = $1 AND wallet_id = $2 AND NOT is_closed`, [asset, wallet],
)).rows[0].usd);

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
  const client = await import('../../db/client');
  db = client.db;
  pool = client.pool;
  spot = (await db.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
  external = (await db.query(`SELECT id FROM wallets WHERE name = 'Wallets externas'`)).rows[0].id;

  await tx('BUY', '2026-01-01T10:00:00Z', 'BTC', 1, { cost_asset: 'EUR', cost_amount: 100 });     // 100 € → 125 $
  await tx('BUY', '2026-01-01T11:00:00Z', 'USDT', 100, { cost_asset: 'EUR', cost_amount: 80 });   // 80 € → 100 $
  await tx('BUY', '2026-01-02T10:00:00Z', 'ETH', 2, { cost_asset: 'USDT', cost_amount: 50 });     // pagado con 50 USDT
  await tx('WITHDRAW', '2026-01-03T10:00:00Z', 'BTC', 0.5, { destination_wallet_id: external });  // a wallet propia
  await tx('SELL', '2026-01-04T10:00:00Z', 'BTC', 0.25, { cost_asset: 'EUR', cost_amount: 30 });  // venta parcial en Spot

  const { runFifoEngine } = await import('./engine');
  const result = await runFifoEngine();
  expect(result.errors).toEqual([]);
}, 30000);

afterAll(async () => {
  await pool.end();
  await testDb.teardown();
});

describe('motor FIFO — coste en USD por lote (#174)', () => {
  it('compra en EUR: coste en USD con el tipo de su fecha', async () => {
    // Quedan 0,25 BTC en Spot (de 1 comprado, 0,5 transferido y 0,25 vendido): 25 € → 31,25 $
    expect(await usdCost('BTC', spot)).toBeCloseTo(31.25, 6);
  });

  it('compra pagada en USDT: coste en USD igual al importe pagado', async () => {
    expect(await usdCost('ETH', spot)).toBeCloseTo(50, 6);
  });

  it('la transferencia a una wallet propia conserva el coste en USD', async () => {
    expect(await usdCost('BTC', external)).toBeCloseTo(62.5, 6);
  });

  it('los USDT gastados reducen su coste en USD en proporción', async () => {
    expect(await usdCost('USDT', spot)).toBeCloseTo(50, 6); // quedan 50 de 100 USDT
  });

  it('todos los lotes tienen tipo USD y los importes en EUR no cambian', async () => {
    const { rows } = await db.query(`SELECT count(*) FILTER (WHERE usd_per_eur IS NULL)::int AS sin_tipo FROM fifo_lots`);
    expect(rows[0].sin_tipo).toBe(0);
    const eth = await db.query(`SELECT cost_basis_eur::float AS eur FROM fifo_lots WHERE asset = 'ETH'`);
    expect(eth.rows[0].eur).toBeCloseTo(40, 6); // 50 USDT × 0,80 €
  });
});

describe('motor FIFO — sin tipo EUR/USD disponible (#174)', () => {
  it('si el precio de USDT falla, el lote se crea igualmente sin coste en USD', async () => {
    const { getHistoricalPriceEur } = await import('../prices/binance') as unknown as { getHistoricalPriceEur: ReturnType<typeof vi.fn> };
    const { usdPerEurAt } = await import('./lotPrimitives');
    getHistoricalPriceEur.mockRejectedValueOnce(new Error('Binance klines HTTP 451'));

    await expect(usdPerEurAt(new Date('2026-02-01T10:00:00Z'))).resolves.toBeNull();
    // La fecha fallida no se vuelve a pedir durante un tiempo.
    getHistoricalPriceEur.mockClear();
    await expect(usdPerEurAt(new Date('2026-02-01T18:00:00Z'))).resolves.toBeNull();
    expect(getHistoricalPriceEur).not.toHaveBeenCalled();
  });
});

