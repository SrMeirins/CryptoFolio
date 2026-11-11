import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Gastos de transmisión y de adquisición con comisiones en otra moneda (#543):
// motor FIFO real y eventos del informe fiscal. Precios simulados: BNB 500,
// USDT 1, resto 100. Datos sintéticos.
const MOCK_PRICES: Record<string, number> = { BNB: 500, USDT: 1 };
vi.mock('../prices/binance', () => ({
  getHistoricalPriceEur: vi.fn((asset: string) => Promise.resolve(MOCK_PRICES[asset] ?? 100)),
}));

let testDb: TestDatabase;
let db: typeof import('../../db/client')['db'];
let pool: typeof import('../../db/client')['pool'];
let eventos: Awaited<ReturnType<typeof import('./eventosAnio')['getEventosAnio']>>['fiscalEvents'];

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
  const dbClient = await import('../../db/client');
  db = dbClient.db;
  pool = dbClient.pool;
  const walletId = (await db.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;

  const tx = async (op: string, fecha: string, asset: string, amount: number, extra: Record<string, unknown> = {}) => {
    const id = randomUUID();
    const amountNet = (extra.amount_net as number | undefined) ?? amount;
    await db.query(
      `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount,
         fee_asset, fee_amount, wallet_id, linked_tx_id)
       VALUES ($1, $2::operation_type, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, op, fecha, asset, amount, amountNet, extra.cost_asset ?? null, extra.cost_amount ?? null,
       extra.fee_asset ?? null, extra.fee_amount ?? null, walletId, extra.linked_tx_id ?? null]);
    return id;
  };

  await tx('BUY', '2024-01-01T00:00:00Z', 'USDT', 1000, { cost_asset: 'EUR', cost_amount: 1000 });
  await tx('BUY', '2024-01-01T00:00:00Z', 'BNB', 1, { cost_asset: 'EUR', cost_amount: 400 });
  // Compra de 10 ABC con 1000 USDT: 0,1 ABC de comisión en especie y 0,01 BNB enlazado.
  const compra = await tx('BUY', '2024-02-01T00:00:00Z', 'ABC', 10,
    { amount_net: 9.9, cost_asset: 'USDT', cost_amount: 1000, fee_asset: 'ABC', fee_amount: 0.1 });
  await tx('FEE_EXCHANGE', '2024-02-01T00:00:00Z', 'BNB', 0.01, { linked_tx_id: compra });
  // Venta de 9,9 ABC por 1500 USDT: 0,02 BNB en la fila y 0,01 BNB enlazado.
  const venta = await tx('SELL', '2025-03-01T00:00:00Z', 'ABC', 9.9,
    { cost_asset: 'USDT', cost_amount: 1500, fee_asset: 'BNB', fee_amount: 0.02 });
  await tx('FEE_EXCHANGE', '2025-03-01T00:00:00Z', 'BNB', 0.01, { linked_tx_id: venta });

  const { runFifoEngine } = await import('../fifo/engine');
  expect((await runFifoEngine()).errors).toEqual([]);
  const { getEventosAnio } = await import('./eventosAnio');
  eventos = (await getEventosAnio(2025)).fiscalEvents;
}, 30000);

afterAll(async () => {
  await pool.end();
  await testDb.teardown();
});

describe('gastos con comisiones en otra moneda (#543)', () => {
  it('la venta de ABC lleva como gastos de transmisión las dos comisiones en BNB', () => {
    const abc = eventos.filter(e => e.activoTransmitido === 'ABC');
    expect(abc).toHaveLength(1);
    // 0,02 BNB + 0,01 BNB a 500 €: 15 € de gastos; transmisión bruta 1500 €.
    expect(abc[0].gastosTransmisionEur).toBeCloseTo(15, 9);
    expect(abc[0].valorTransmisionEur).toBeCloseTo(1500, 9);
  });

  it('el lote vendido lleva como gastos de adquisición la comisión en especie y la de BNB de la compra', () => {
    const abc = eventos.find(e => e.activoTransmitido === 'ABC')!;
    // Especie: 0,1 ABC de 10 comprados con 1000 € = 10 €, que ya están dentro
    // de lo pagado; BNB: 0,01 × 500 = 5 €. Coste total 1005 = 990 + 15.
    expect(abc.gastosAdquisicionEur).toBeCloseTo(15, 9);
    expect(abc.valorAdquisicionEur).toBeCloseTo(990, 9);
    // (1500 - 15) - (990 + 15) = 480.
    expect(abc.gananciaPerdidaEur).toBeCloseTo(480, 9);
  });

  it('los BNB entregados como comisión son su propia transmisión, sin gastos', () => {
    const bnb = eventos.filter(e => e.activoTransmitido === 'BNB');
    expect(bnb.map(e => e.valorTransmisionEur).sort((a, b) => a - b)).toEqual([5, 10]);
    expect(bnb.every(e => e.gastosTransmisionEur === 0)).toBe(true);
  });

  it('la compra informa de su comisión al coste en el activo entregado, no en el BNB', async () => {
    const { getEventosAnio } = await import('./eventosAnio');
    const ev2024 = (await getEventosAnio(2024)).fiscalEvents;
    const usdt = ev2024.filter(e => e.activoTransmitido === 'USDT');
    // 10 € de comisión en especie + 5 € de BNB enlazado, sumados al coste del ABC.
    expect(usdt.reduce((t, e) => t + e.comisionCompraEur, 0)).toBeCloseTo(15, 9);
    expect(usdt.every(e => e.gastosTransmisionEur === 0)).toBe(true);
    expect(ev2024.filter(e => e.activoTransmitido === 'BNB').every(e => e.comisionCompraEur === 0)).toBe(true);
    expect(ev2024.every(e => e.esConvert === false)).toBe(true);
  });

  it('en todos los eventos: (transmisión - gastos) - (adquisición + gastos) = resultado', () => {
    for (const e of eventos) {
      expect((e.valorTransmisionEur - e.gastosTransmisionEur) - (e.valorAdquisicionEur + e.gastosAdquisicionEur))
        .toBeCloseTo(e.gananciaPerdidaEur, 9);
    }
  });
});
