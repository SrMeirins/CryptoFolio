import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// P&L diario de extremo a extremo (#165): transacciones de prueba procesadas
// por el motor FIFO real, cierres sembrados en price_close_madrid y sin red.
vi.mock('../prices/binance', () => ({
  getHistoricalPriceEur: vi.fn(() => Promise.resolve(1)),
}));
vi.mock('../prices/liveFeed', () => ({
  getAllLivePrices: () => new Map<string, number>(),
}));
vi.mock('../prices/closePrices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../prices/closePrices')>()),
  prefetchCloseRange: vi.fn(async () => {}),
}));

let testDb: TestDatabase;
let db: typeof import('../../db/client')['db'];
let pool: typeof import('../../db/client')['pool'];
let runFifoEngine: typeof import('../fifo/engine')['runFifoEngine'];
let getDailyPnl: typeof import('./pnlService')['getDailyPnl'];
let spot: string;
let external: string;

async function tx(operation_type: string, timestamp: string, asset: string, amount: number,
  extra: Partial<{ cost_asset: string | null; cost_amount: number | null; destination_wallet_id: string | null }> = {}) {
  await db.query(
    `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id, destination_wallet_id, account)
     VALUES ($1, $2::operation_type, $3, $4, $5, $5, $6, $7, $8, $9, 'Spot')`,
    [randomUUID(), operation_type, timestamp, asset, amount, extra.cost_asset ?? null, extra.cost_amount ?? null, spot, extra.destination_wallet_id ?? null],
  );
}

async function closes(asset: string, prices: Record<string, number>) {
  for (const [day, price] of Object.entries(prices)) {
    await db.query(
      `INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES ($1, $2, $3, 'binance_1h')`,
      [asset, day, price],
    );
  }
}

async function reset() {
  await db.query('DELETE FROM fifo_lot_consumptions');
  await db.query('DELETE FROM fifo_lots');
  await db.query('DELETE FROM transactions');
  await db.query('DELETE FROM price_close_madrid');
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
  const client = await import('../../db/client');
  db = client.db;
  pool = client.pool;
  ({ runFifoEngine } = await import('../fifo/engine'));
  ({ getDailyPnl } = await import('./pnlService'));
  spot = (await db.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
  external = (await db.query(`SELECT id FROM wallets WHERE name = 'Wallets externas'`)).rows[0].id;
}, 30000);

afterAll(async () => {
  await pool.end();
  await testDb.teardown();
});

describe('getDailyPnl — flujos de capital y rendimiento', () => {
  const byDate = (r: Awaited<ReturnType<typeof getDailyPnl>>) => Object.fromEntries(r.days.map(d => [d.date, d]));

  it('cada caso se refleja como se espera, día a día', async () => {
    await reset();
    await tx('DEPOSIT_FIAT', '2026-01-10T10:00:00Z', 'EUR', 1000);                                       // entrada de capital
    await tx('BUY', '2026-01-10T12:00:00Z', 'XRP', 500, { cost_asset: 'EUR', cost_amount: 500 });          // compra: neutra
    await tx('WITHDRAW', '2026-01-12T09:00:00Z', 'XRP', 200, { destination_wallet_id: external });         // a wallet propia
    await tx('WITHDRAW_FIAT', '2026-01-13T10:00:00Z', 'EUR', 300);                                        // salida de capital
    await tx('LOST', '2026-01-14T10:00:00Z', 'XRP', 100);                                                 // pérdida real
    await tx('GIFT_SENT', '2026-01-15T10:00:00Z', 'XRP', 50);                                             // salida de capital
    await tx('MARGIN_BORROW', '2026-01-16T10:00:00Z', 'USDT', 100);                                       // préstamo
    await tx('MARGIN_REPAY', '2026-01-17T10:00:00Z', 'USDT', 100);                                        // devolución
    const fifo = await runFifoEngine();
    expect(fifo.errors).toEqual([]);

    await closes('XRP', {
      '2026-01-09': 1, '2026-01-10': 1, '2026-01-11': 1.1, '2026-01-12': 1.1, '2026-01-13': 1,
      '2026-01-14': 1, '2026-01-15': 1, '2026-01-16': 1, '2026-01-17': 1,
    });
    await closes('USDT', { '2026-01-15': 0.9, '2026-01-16': 0.9, '2026-01-17': 0.9 });

    const r = await getDailyPnl({ from: '2026-01-10', to: '2026-01-17' });
    const d = byDate(r);

    expect(r.refreshing).toBe(false);
    expect(d['2026-01-10']).toMatchObject({ value: 1000, inflow: 1000, pnl: 0 });   // depósito + compra
    expect(d['2026-01-11']).toMatchObject({ value: 1050, pnl: 50, pct: 5 });       // XRP +10 %
    expect(d['2026-01-12']).toMatchObject({ value: 1050, pnl: 0 });                // transferencia propia: sin flujo ni duplicado
    expect(d['2026-01-13']).toMatchObject({ value: 700, outflow: 300, pnl: -50 });  // retirada EUR + XRP −10 %
    expect(d['2026-01-14']).toMatchObject({ value: 600, pnl: -100 });              // LOST resta del P&L
    expect(d['2026-01-15']).toMatchObject({ value: 550, outflow: 50, pnl: 0 });     // regalo: salida, no pérdida
    expect(d['2026-01-16']).toMatchObject({ value: 640, inflow: 90, pnl: 0 });      // préstamo: no es ganancia
    expect(d['2026-01-17']).toMatchObject({ value: 550, outflow: 90, pnl: 0 });     // devolución: no es pérdida
    expect(r.totalPnl).toBe(-100);
    expect(r.days.every(x => x.complete)).toBe(true);
  });

  it('las tenencias anteriores a una transferencia no se cuentan dos veces', async () => {
    await reset();
    await tx('DEPOSIT_FIAT', '2026-02-01T10:00:00Z', 'EUR', 100);
    await tx('BUY', '2026-02-01T11:00:00Z', 'XRP', 100, { cost_asset: 'EUR', cost_amount: 100 });
    await tx('WITHDRAW', '2026-02-05T10:00:00Z', 'XRP', 100, { destination_wallet_id: external });
    await runFifoEngine();
    await closes('XRP', { '2026-02-01': 1, '2026-02-02': 1, '2026-02-03': 1, '2026-02-04': 1, '2026-02-05': 1 });

    const r = await getDailyPnl({ from: '2026-02-02', to: '2026-02-05' });
    expect(r.days.map(x => x.value)).toEqual([100, 100, 100, 100]);
  });

  it('los flujos se asignan al día local de Madrid, también con cambio de horario', async () => {
    await reset();
    await tx('DEPOSIT_FIAT', '2026-03-28T22:30:00Z', 'EUR', 10);  // 23:30 del 28 en Madrid (CET)
    await tx('DEPOSIT_FIAT', '2026-03-29T22:30:00Z', 'EUR', 20);  // 00:30 del 30 en Madrid (CEST)
    await runFifoEngine();

    const r = await getDailyPnl({ from: '2026-03-28', to: '2026-03-30' });
    expect(r.days.map(x => [x.date, x.inflow])).toEqual([['2026-03-28', 10], ['2026-03-29', 0], ['2026-03-30', 20]]);
  });

  it('depósitos con tarjeta OCBS cuentan como entrada y la venta de EUR resta del saldo', async () => {
    await reset();
    await db.query(
      `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, wallet_id, account, notes)
       VALUES ($1, 'IGNORED', '2026-05-01T10:00:00Z', 'EUR', 100, 100, $2, 'Spot', 'Deposit Fiat OCBS')`,
      [randomUUID(), spot],
    );
    await tx('BUY', '2026-05-01T10:00:01Z', 'XRP', 100, { cost_asset: 'EUR', cost_amount: 100 });   // gasta los 100 €
    await tx('DEPOSIT_FIAT', '2026-05-02T10:00:00Z', 'EUR', 50);
    await tx('SELL', '2026-05-02T11:00:00Z', 'EUR', 50, { cost_asset: 'XRP', cost_amount: 50 });     // 50 € → 50 XRP
    await runFifoEngine();
    await closes('XRP', { '2026-04-30': 1, '2026-05-01': 1, '2026-05-02': 1 });

    const r = await getDailyPnl({ from: '2026-05-01', to: '2026-05-02' });
    expect(r.days.map(x => [x.date, x.value, x.inflow, x.pnl])).toEqual([
      ['2026-05-01', 100, 100, 0],   // depósito OCBS + compra: sin P&L
      ['2026-05-02', 150, 50, 0],    // depósito + EUR→XRP: el saldo EUR vuelve a 0
    ]);
  });

  it('si faltan cierres, marca los días incompletos y la precarga', async () => {
    await reset();
    await tx('DEPOSIT_FIAT', '2026-04-01T10:00:00Z', 'EUR', 100);
    await tx('BUY', '2026-04-01T11:00:00Z', 'XRP', 100, { cost_asset: 'EUR', cost_amount: 100 });
    await runFifoEngine();
    await closes('XRP', { '2026-04-01': 1 });

    const r = await getDailyPnl({ from: '2026-04-01', to: '2026-04-02' });
    expect(r.refreshing).toBe(true);
    expect(r.days.map(x => x.complete)).toEqual([true, false]);
  });
});
