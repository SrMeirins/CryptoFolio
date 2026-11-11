import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';
import type { Vela } from '../prices/binance';

// Permutas valoradas en el momento (#599): motor FIFO real y eventos fiscales,
// con las velas de Binance simuladas. 1 EUR = 1 USDT. Datos sintéticos.
const MIN = 60_000;
const velas = new Map<string, number>(); // par -> precio de la vela de minuto
vi.mock('../prices/binance', () => ({
  fetchVelas: vi.fn(async (pair: string, intervalo: string, desde: number) => {
    const precio = velas.get(pair);
    if (intervalo !== '1m' || precio === undefined) return [];
    const inicio = desde + 15 * MIN;
    return [{ inicio, cierre: precio, volumen: 1, volumenCotizacion: precio } satisfies Vela];
  }),
  getHistoricalPriceEur: vi.fn(async (asset: string) => (asset === 'EUR' || asset === 'USDT' ? 1 : 50)),
  isDefinitiveNoData: () => true,
}));
vi.mock('../prices/pairDetector', () => ({
  getOrDetectPairInfo: vi.fn(async (s: string) => ({
    symbol: s, binanceEurPair: null, binanceUsdtPair: s === 'USDT' ? null : `${s}USDT`, binanceBtcPair: null, binanceEthPair: null,
    priceSource: 'usdt_proxy', isStablecoin: false,
  })),
}));

let testDb: TestDatabase;
let db: typeof import('../../db/client')['db'];
let pool: typeof import('../../db/client')['pool'];
let eventos: Awaited<ReturnType<typeof import('../fiscal/eventosAnio')['getEventosAnio']>>['fiscalEvents'];

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
  const dbClient = await import('../../db/client');
  db = dbClient.db;
  pool = dbClient.pool;
  const walletId = (await db.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
  const tx = async (fecha: string, asset: string, amount: number, costAsset: string, costAmount: number) => {
    await db.query(
      `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
       VALUES ($1, 'BUY', $2, $3, $4, $4, $5, $6, $7)`,
      [randomUUID(), fecha, asset, amount, costAsset, costAmount, walletId]);
  };
  velas.set('EURUSDT', 1);
  velas.set('ABCUSDT', 11); // 10 ABC valen 110 USDT: 10 % más que los 100 entregados
  velas.set('DEFUSDT', 10.2); // 10 DEF valen 102: dentro de la tolerancia
  // GHI no tiene velas: precio del día.
  await tx('2025-01-01T00:00:00Z', 'USDT', 1000, 'EUR', 1000);
  await tx('2025-03-01T10:00:00Z', 'ABC', 10, 'USDT', 100);
  await tx('2025-03-01T11:00:00Z', 'DEF', 10, 'USDT', 100);
  await tx('2025-03-01T12:00:00Z', 'GHI', 10, 'USDT', 100);

  const { runFifoEngine } = await import('./engine');
  expect((await runFifoEngine()).errors).toEqual([]);
  const { getEventosAnio } = await import('../fiscal/eventosAnio');
  eventos = (await getEventosAnio(2025)).fiscalEvents.filter(e => e.activoTransmitido === 'USDT');
}, 30000);

afterAll(async () => {
  await pool.end();
  await testDb.teardown();
});

const deLaPermuta = (recibido: string) => eventos.find(e => e.activoRecibido === recibido)!;

describe('permutas valoradas en el momento (#599)', () => {
  it('fuera de la tolerancia: «el mayor» de los dos lados, indicado con sus valores', async () => {
    const e = deLaPermuta('ABC');
    expect(e).toMatchObject({ valoracion: 'mayor', valorEntregadoEur: 100, valorRecibidoEur: 110 });
    expect(e.valorTransmisionEur).toBeCloseTo(110, 9);
    const lote = await db.query(`SELECT cost_basis_eur FROM fifo_lots WHERE asset = 'ABC'`);
    expect(Number(lote.rows[0].cost_basis_eur)).toBeCloseTo(110, 9);
  });

  it('dentro de la tolerancia: el lado más líquido (los USDT entregados), sin indicar valores', () => {
    const e = deLaPermuta('DEF');
    expect(e).toMatchObject({ valoracion: 'momento', valorEntregadoEur: null, valorRecibidoEur: null });
    expect(e.valorTransmisionEur).toBeCloseTo(100, 9);
  });

  it('sin precio del momento: precio del día y queda indicado', () => {
    const e = deLaPermuta('GHI');
    expect(e.valoracion).toBe('diario');
    expect(e.valorTransmisionEur).toBeCloseTo(100, 9);
  });

  it('el precio del momento queda en caché por activo y minuto', async () => {
    const r = await db.query(`SELECT asset, fuente FROM price_momento ORDER BY asset`);
    expect(r.rows).toEqual(expect.arrayContaining([{ asset: 'ABC', fuente: '1m' }, { asset: 'GHI', fuente: '1d' }]));
  });
});
