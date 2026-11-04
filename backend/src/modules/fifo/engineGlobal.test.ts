import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// FIFO global por activo (#476): una transmisión consume las unidades
// adquiridas primero en cualquier wallet, aunque se hayan traspasado; los
// traspasos no consumen fiscalmente y las cantidades por wallet no cambian.
// Datos sintéticos; precio de mercado fijo para controlar la aritmética.
vi.mock('../prices/binance', () => ({
  getHistoricalPriceEur: vi.fn(() => Promise.resolve(100)),
}));

let testDb: TestDatabase;
let db: typeof import('../../db/client')['db'];
let pool: typeof import('../../db/client')['pool'];
let runFifoEngine: typeof import('./engine')['runFifoEngine'];
const W: Record<'spot' | 'bitvavo' | 'funding' | 'strategy', string> = { spot: '', bitvavo: '', funding: '', strategy: '' };

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
  const dbClient = await import('../../db/client');
  db = dbClient.db;
  pool = dbClient.pool;
  ({ runFifoEngine } = await import('./engine'));
  const id = async (name: string) => (await db.query(`SELECT id FROM wallets WHERE name = $1`, [name])).rows[0].id as string;
  W.spot = await id('Binance Spot');
  W.bitvavo = await id('Bitvavo');
  W.funding = await id('Binance Funding');
  W.strategy = await id('Binance Strategy');
}, 30000);

afterAll(async () => {
  await pool.end();
  await testDb.teardown();
});

beforeEach(async () => {
  await db.query('DELETE FROM fifo_shortfalls');
  await db.query('DELETE FROM fifo_lot_consumptions');
  await db.query('DELETE FROM fifo_lots');
  await db.query('DELETE FROM transactions');
});

interface TxInput {
  operation_type: string; timestamp: string; asset: string; amount: number;
  cost_asset?: string | null; cost_amount?: number | null; wallet_id: string; destination_wallet_id?: string | null;
}

async function tx(t: TxInput): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id, destination_wallet_id, destination_pending, account)
     VALUES ($1, $2::operation_type, $3, $4, $5, $5, $6, $7, $8, $9, FALSE, 'Spot')`,
    [id, t.operation_type, t.timestamp, t.asset, t.amount, t.cost_asset ?? null, t.cost_amount ?? null, t.wallet_id, t.destination_wallet_id ?? null],
  );
  return id;
}

const buy = (wallet_id: string, timestamp: string, amount: number, eur: number, asset = 'BTC') =>
  tx({ operation_type: 'BUY', timestamp, asset, amount, cost_asset: 'EUR', cost_amount: eur, wallet_id });
const sell = (wallet_id: string, timestamp: string, amount: number, eur: number, asset = 'BTC') =>
  tx({ operation_type: 'SELL', timestamp, asset, amount, cost_asset: 'EUR', cost_amount: eur, wallet_id });
const transfer = (from: string, to: string, timestamp: string, amount: number, asset = 'BTC') =>
  tx({ operation_type: 'TRANSFER_INTERNAL', timestamp, asset, amount, wallet_id: from, destination_wallet_id: to });

/** Cantidad abierta del activo por wallet. */
async function openByWallet(asset = 'BTC'): Promise<Record<string, number>> {
  const { rows } = await db.query(
    `SELECT wallet_id, SUM(quantity_remaining)::float AS q FROM fifo_lots
     WHERE asset = $1 AND NOT is_closed GROUP BY wallet_id`, [asset]);
  return Object.fromEntries(rows.filter(r => r.q > 1e-9).map(r => [r.wallet_id, r.q]));
}

/** Consumos con efecto fiscal de una operación: lote de origen, cantidad y ganancia. */
async function fiscalOf(txId: string) {
  const { rows } = await db.query(
    `SELECT l.wallet_id, l.opened_at, c.quantity_consumed::float AS q, c.cost_basis_consumed_eur::float AS cost,
            c.gain_loss_eur::float AS gain
     FROM fifo_lot_consumptions c JOIN fifo_lots l ON l.id = c.lot_id
     WHERE c.consuming_transaction_id = $1 AND c.fiscal_event_type <> 'NONE'
     ORDER BY l.opened_at, l.created_at`, [txId]);
  return rows as Array<{ wallet_id: string; opened_at: Date; q: number; cost: number; gain: number }>;
}

describe('FIFO global por activo (#476)', () => {
  it('un lote comprado hace años y traspasado dos veces se consume en la primera venta, aunque se venda desde otra wallet', async () => {
    await buy(W.spot, '2021-01-10T10:00:00Z', 1, 100);                 // lote 1: el más antiguo
    await transfer(W.spot, W.bitvavo, '2022-03-01T10:00:00Z', 1);       // traspaso 1
    await transfer(W.bitvavo, W.funding, '2023-05-01T10:00:00Z', 1);    // traspaso 2
    await buy(W.strategy, '2022-06-01T10:00:00Z', 1, 300);              // lote 2, más nuevo
    const venta = await sell(W.strategy, '2024-02-01T10:00:00Z', 1, 500);

    const result = await runFifoEngine();
    expect(result.errors).toEqual([]);

    const fiscal = await fiscalOf(venta);
    expect(fiscal).toHaveLength(1);
    expect(new Date(fiscal[0].opened_at).toISOString()).toBe('2021-01-10T10:00:00.000Z');
    expect(fiscal[0].cost).toBeCloseTo(100, 6);
    expect(fiscal[0].gain).toBeCloseTo(400, 6);

    // Las unidades no cambian de wallet: la fría (Funding) sigue con 1 y Strategy queda a 0.
    expect(await openByWallet()).toEqual({ [W.funding]: 1 });
  });

  it('los traspasos no generan ganancia ni pérdida y conservan la fecha de adquisición', async () => {
    await buy(W.spot, '2021-01-10T10:00:00Z', 1, 100);
    const t1 = await transfer(W.spot, W.bitvavo, '2022-03-01T10:00:00Z', 1);
    await runFifoEngine();

    const { rows } = await db.query(
      `SELECT fiscal_event_type, gain_loss_eur::float AS g FROM fifo_lot_consumptions WHERE consuming_transaction_id = $1`, [t1]);
    expect(rows.every(r => r.fiscal_event_type === 'NONE' && r.g === 0)).toBe(true);
    const lot = (await db.query(`SELECT opened_at FROM fifo_lots WHERE wallet_id = $1 AND NOT is_closed`, [W.bitvavo])).rows[0];
    expect(new Date(lot.opened_at).toISOString()).toBe('2021-01-10T10:00:00.000Z');
  });

  it('si el lote más antiguo está en la propia wallet no hay reubicación', async () => {
    await buy(W.spot, '2021-01-01T00:00:00Z', 1, 100);
    await buy(W.bitvavo, '2022-01-01T00:00:00Z', 1, 200);
    const venta = await sell(W.spot, '2023-01-01T00:00:00Z', 1, 300);
    await runFifoEngine();

    const none = await db.query(
      `SELECT count(*)::int AS n FROM fifo_lot_consumptions WHERE consuming_transaction_id = $1 AND fiscal_event_type = 'NONE'`, [venta]);
    expect(none.rows[0].n).toBe(0);
    expect((await fiscalOf(venta))[0].gain).toBeCloseTo(200, 6);
    expect(await openByWallet()).toEqual({ [W.bitvavo]: 1 });
  });

  it('reubicación parcial que abarca varios lotes conserva las cantidades por wallet', async () => {
    await buy(W.bitvavo, '2021-01-01T00:00:00Z', 0.5, 50);
    await buy(W.bitvavo, '2021-02-01T00:00:00Z', 0.5, 60);
    await buy(W.spot, '2022-01-01T00:00:00Z', 2, 600);
    const venta = await sell(W.spot, '2023-01-01T00:00:00Z', 1.2, 480);

    const result = await runFifoEngine();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);

    const fiscal = await fiscalOf(venta);
    expect(fiscal.reduce((s, c) => s + c.cost, 0)).toBeCloseTo(50 + 60 + 60, 6);
    expect(fiscal.reduce((s, c) => s + c.gain, 0)).toBeCloseTo(480 - 170, 6);

    const open = await openByWallet();
    expect(open[W.bitvavo]).toBeCloseTo(1, 9);
    expect(open[W.spot]).toBeCloseTo(0.8, 9);

    // Coste abierto + coste consumido fiscalmente = coste total adquirido.
    const abierto = (await db.query(`SELECT SUM(cost_basis_eur)::float AS c FROM fifo_lots WHERE NOT is_closed`)).rows[0].c;
    expect(abierto + 170).toBeCloseTo(50 + 60 + 600, 6);
  });

  it('desempata por orden de creación con la misma fecha de adquisición en wallets distintas', async () => {
    const T = '2022-01-01T00:00:00Z';
    await buy(W.spot, T, 1, 100);
    await buy(W.bitvavo, T, 1, 200);
    const venta = await sell(W.bitvavo, '2023-01-01T00:00:00Z', 1, 300);
    await runFifoEngine();
    const fiscal = await fiscalOf(venta);
    expect(fiscal[0].wallet_id).toBe(W.spot);
    expect(fiscal[0].cost).toBeCloseTo(100, 6);
  });

  it('una permuta consume con la regla global el activo entregado', async () => {
    await buy(W.bitvavo, '2021-01-01T00:00:00Z', 1, 10);
    await buy(W.spot, '2022-01-01T00:00:00Z', 1, 90);
    const permuta = await tx({ operation_type: 'BUY', timestamp: '2023-01-01T00:00:00Z', asset: 'ETH', amount: 2, cost_asset: 'BTC', cost_amount: 1, wallet_id: W.spot });
    await runFifoEngine();
    const fiscal = await fiscalOf(permuta);
    expect(fiscal[0].wallet_id).toBe(W.bitvavo);
    expect(fiscal[0].cost).toBeCloseTo(10, 6);
    expect(await openByWallet()).toEqual({ [W.bitvavo]: 1 });
  });

  it('faltante global: solo si no hay cantidad suficiente sumando todas las wallets', async () => {
    await buy(W.bitvavo, '2021-01-01T00:00:00Z', 1, 100);
    const venta = await sell(W.bitvavo, '2023-01-01T00:00:00Z', 2, 400);
    const result = await runFifoEngine();
    expect(result.errors.some(e => e.includes(venta))).toBe(true);
    const sf = (await db.query(`SELECT missing::float AS m FROM fifo_shortfalls WHERE transaction_id = $1`, [venta])).rows;
    expect(sf).toHaveLength(1);
    expect(sf[0].m).toBeCloseTo(1, 9);
  });

  it('un hueco de datos en la wallet de la venta no vacía otras wallets: queda como faltante de esa wallet', async () => {
    await buy(W.bitvavo, '2021-01-01T00:00:00Z', 1, 100);            // fría, más antigua
    await buy(W.spot, '2022-01-01T00:00:00Z', 0.3, 60);
    const venta = await sell(W.spot, '2023-01-01T00:00:00Z', 1, 400); // vende 1 con 0,3 según los datos
    const result = await runFifoEngine();

    // Solo se disponen las 0,3 que la wallet tiene, con el coste del lote más antiguo (FIFO global).
    const fiscal = await fiscalOf(venta);
    expect(fiscal.reduce((s, c) => s + c.q, 0)).toBeCloseTo(0.3, 9);
    expect(fiscal[0].wallet_id).toBe(W.bitvavo);
    expect(fiscal[0].cost).toBeCloseTo(30, 6);

    // La fría conserva su unidad; el resto es un hueco de datos de Spot.
    const open = await openByWallet();
    expect(Object.keys(open)).toEqual([W.bitvavo]);
    expect(open[W.bitvavo]).toBeCloseTo(1, 9);
    expect(result.errors.some(e => e.includes(venta))).toBe(true);
    const sf = (await db.query(`SELECT wallet_id, missing::float AS m FROM fifo_shortfalls WHERE transaction_id = $1`, [venta])).rows;
    expect(sf).toHaveLength(1);
    expect(sf[0].wallet_id).toBe(W.spot);
    expect(sf[0].m).toBeCloseTo(0.7, 9);
  });

  it('sin unidades en la wallet de la venta no se consume nada de otras wallets', async () => {
    await buy(W.bitvavo, '2021-01-01T00:00:00Z', 1, 100);
    const venta = await sell(W.spot, '2023-01-01T00:00:00Z', 0.5, 200);
    const result = await runFifoEngine();
    expect(await fiscalOf(venta)).toEqual([]);
    expect(await openByWallet()).toEqual({ [W.bitvavo]: 1 });
    expect(result.errors.some(e => e.includes(venta))).toBe(true);
    const sf = (await db.query(`SELECT wallet_id, missing::float AS m FROM fifo_shortfalls WHERE transaction_id = $1`, [venta])).rows;
    expect(sf).toEqual([{ wallet_id: W.spot, m: 0.5 }]);
  });

  it('el simulador de venta da el mismo coste que el motor para la misma venta', async () => {
    await buy(W.bitvavo, '2021-01-01T00:00:00Z', 0.5, 50);
    await buy(W.spot, '2022-01-01T00:00:00Z', 2, 600);
    await runFifoEngine();

    const { cargarContextoVenta, evaluarVenta } = await import('../fiscal/simulacionVenta');
    const ctx = await cargarContextoVenta('BTC', W.spot);
    if ('error' in ctx) throw new Error(ctx.error);
    const simulada = evaluarVenta(ctx, 1.2, 400, 0);

    const venta = await sell(W.spot, '2023-01-01T00:00:00Z', 1.2, 480);
    await runFifoEngine();
    const real = await fiscalOf(venta);
    expect(simulada.totalCostBasis).toBeCloseTo(real.reduce((s, c) => s + c.cost, 0), 6);
    expect(simulada.netGainLoss).toBeCloseTo(real.reduce((s, c) => s + c.gain, 0), 6);
  });

  it('devolución de margen: el principal sale de la wallet del préstamo y los intereses siguen la regla global', async () => {
    await buy(W.bitvavo, '2021-01-01T00:00:00Z', 1, 10);                                        // lote antiguo, coste 10
    await tx({ operation_type: 'MARGIN_BORROW', timestamp: '2023-01-01T00:00:00Z', asset: 'BTC', amount: 1, wallet_id: W.spot }); // abre a 100
    await buy(W.spot, '2023-01-02T00:00:00Z', 0.1, 10);
    const repay = await tx({ operation_type: 'MARGIN_REPAY', timestamp: '2023-02-01T00:00:00Z', asset: 'BTC', amount: 1.1, wallet_id: W.spot });

    const result = await runFifoEngine();
    expect(result.errors).toEqual([]);

    const principal = (await db.query(
      `SELECT l.wallet_id, c.quantity_consumed::float AS q FROM fifo_lot_consumptions c JOIN fifo_lots l ON l.id = c.lot_id
       WHERE c.consuming_transaction_id = $1 AND c.fiscal_event_type = 'NONE' AND l.wallet_id = $2`, [repay, W.spot])).rows;
    expect(principal.reduce((s, r) => s + r.q, 0)).toBeCloseTo(1 + 0.1, 9); // 1 de principal + 0,1 reubicado a Bitvavo

    const intereses = await fiscalOf(repay);
    expect(intereses).toHaveLength(1);
    expect(intereses[0].wallet_id).toBe(W.bitvavo);
    expect(intereses[0].q).toBeCloseTo(0.1, 9);
    expect(intereses[0].gain).toBeCloseTo(-1, 6);

    // Bitvavo conserva su unidad; Spot devuelve todo lo que tenía.
    const open = await openByWallet();
    expect(Object.keys(open)).toEqual([W.bitvavo]);
    expect(open[W.bitvavo]).toBeCloseTo(1, 9);
  });

  it('una devolución de margen solo de intereses, aunque sea diminuta, consume sus lotes', async () => {
    await buy(W.spot, '2021-01-01T00:00:00Z', 0.001, 1);
    const repay = await tx({ operation_type: 'MARGIN_REPAY', timestamp: '2022-01-01T00:00:00Z', asset: 'BTC', amount: 0.00002375, wallet_id: W.spot });
    await runFifoEngine();
    const intereses = await fiscalOf(repay);
    expect(intereses.reduce((s, c) => s + c.q, 0)).toBeCloseTo(0.00002375, 12);
    expect((await openByWallet())[W.spot]).toBeCloseTo(0.001 - 0.00002375, 12);
  });
});
