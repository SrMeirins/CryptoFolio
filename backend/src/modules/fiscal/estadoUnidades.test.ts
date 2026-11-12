import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Estado de las unidades de un rendimiento (#544): se siguen a través de los
// traslados entre wallets. Precio del día simulado (10 €); datos sintéticos.
vi.mock('../prices/binance', () => ({ getHistoricalPriceEur: vi.fn(async () => 10) }));

let testDb: TestDatabase;
let db: typeof import('../../db/client')['db'];
let pool: typeof import('../../db/client')['pool'];
let rend: Awaited<ReturnType<typeof import('./eventosAnio')['getEventosAnio']>>['rendimientos'];
const ids: Record<string, string> = {};

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
  const dbClient = await import('../../db/client');
  db = dbClient.db;
  pool = dbClient.pool;
  const wallets = (await db.query(`SELECT id FROM wallets ORDER BY name LIMIT 2`)).rows.map(r => r.id as string);
  const tx = async (clave: string, op: string, fecha: string, amount: number, extra: Record<string, unknown> = {}) => {
    ids[clave] = randomUUID();
    await db.query(
      `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, price_per_unit, cost_asset, cost_amount,
         wallet_id, destination_wallet_id)
       VALUES ($1, $2::operation_type, $3, 'ABC', $4, $4, $5, $6, $7, $8, $9)`,
      [ids[clave], op, fecha, amount, extra.price ?? null, extra.cost_asset ?? null, extra.cost_amount ?? null,
       extra.wallet ?? wallets[0], extra.destino ?? null]);
  };
  // 10 ABC de staking a 2 €/u; 6 pasan a la otra wallet; allí se venden 3 por 30 €.
  await tx('staking', 'STAKING_REWARD', '2025-02-10T10:00:00Z', 10, { price: 2 });
  await tx('traslado', 'TRANSFER_INTERNAL', '2025-03-01T10:00:00Z', 6, { destino: wallets[1] });
  await tx('venta', 'SELL', '2026-01-15T10:00:00Z', 3, { cost_asset: 'EUR', cost_amount: 30, wallet: wallets[1] });
  // Un airdrop que no se toca.
  await tx('airdrop', 'AIRDROP', '2025-05-01T10:00:00Z', 4, { price: 1 });
  // Un cashback de XYZ cuyas unidades devuelven un préstamo de margen (sin efecto fiscal).
  ids.cashback = randomUUID();
  await db.query(
    `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, price_per_unit, wallet_id)
     VALUES ($1, 'CASHBACK', '2025-06-01T10:00:00Z', 'XYZ', 2, 2, 1, $2)`, [ids.cashback, wallets[0]]);
  await db.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('MARGIN_BORROW', '2025-06-02T10:00:00Z', 'XYZ', 5, 5, $1), ('MARGIN_REPAY', '2025-06-03T10:00:00Z', 'XYZ', 2, 2, $1)`, [wallets[0]]);

  const { runFifoEngine } = await import('../fifo/engine');
  expect((await runFifoEngine()).errors).toEqual([]);
  const { getEventosAnio } = await import('./eventosAnio');
  rend = (await getEventosAnio(2025)).rendimientos;
}, 30000);

afterAll(async () => {
  await pool.end();
  await testDb.teardown();
});

describe('estado de las unidades de un rendimiento (#544)', () => {
  it('sigue las unidades a través del traslado: 3 de 10 transmitidas, su resultado y el año', () => {
    const r = rend.find(x => x.txId === ids.staking)!;
    expect(r).toMatchObject({ operacion: 'STAKING_REWARD', precioEur: 2, valorEur: 20 });
    expect(r.estado).toMatchObject({ cantidad: 10, conservada: 7, transmitida: 3, sinEfecto: 0, anios: [2026] });
    // 30 € por 3 unidades que costaron 2 €/u: 24 € de ganancia.
    expect(r.estado!.resultadoEur).toBeCloseTo(24, 9);
  });

  it('las que no se han tocado: conservadas, sin resultado ni años', () => {
    expect(rend.find(x => x.txId === ids.airdrop)!.estado).toEqual({ cantidad: 4, conservada: 4, transmitida: 0, sinEfecto: 0, resultadoEur: 0, anios: [] });
  });

  it('lo que devuelve un préstamo de margen ya no se conserva, aunque no se transmita', () => {
    const e = rend.find(x => x.txId === ids.cashback)!.estado!;
    expect(e).toMatchObject({ cantidad: 2, transmitida: 0, resultadoEur: 0 });
    expect(e.conservada).toBeCloseTo(0, 9);
    expect(e.sinEfecto).toBeCloseTo(2, 9);
  });

  it('el lote trasladado guarda su lote de origen', async () => {
    const r = await db.query(`SELECT count(*)::int AS n FROM fifo_lots WHERE origin_lot_id IS NOT NULL AND asset = 'ABC'`);
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});
