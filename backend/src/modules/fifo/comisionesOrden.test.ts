import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Comisiones de una orden en el FIFO (#543): la comisión es gasto de la compra
// (coste) o de la venta (resta de lo obtenido), nunca se suma a lo que se
// transmite del activo entregado. Precios simulados: BNB 500, USDT 1, resto 100.
const MOCK_PRICES: Record<string, number> = { BNB: 500, USDT: 1 };
vi.mock('../prices/binance', () => ({
  getHistoricalPriceEur: vi.fn((asset: string) => Promise.resolve(MOCK_PRICES[asset] ?? 100)),
}));

let testDb: TestDatabase;
let db: typeof import('../../db/client')['db'];
let pool: typeof import('../../db/client')['pool'];
let runFifoEngine: typeof import('./engine')['runFifoEngine'];
let walletId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
  const dbClient = await import('../../db/client');
  db = dbClient.db;
  pool = dbClient.pool;
  ({ runFifoEngine } = await import('./engine'));
  walletId = (await db.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
}, 30000);

afterAll(async () => {
  await pool.end();
  await testDb.teardown();
});

beforeEach(async () => {
  await db.query('DELETE FROM fifo_lot_consumptions');
  await db.query('DELETE FROM fifo_lots');
  await db.query('DELETE FROM fifo_shortfalls');
  await db.query('UPDATE transactions SET linked_tx_id = NULL');
  await db.query('DELETE FROM transactions');
});

interface TxDatos {
  operation_type: string; timestamp: string; asset: string; amount: number; amount_net?: number;
  cost_asset?: string | null; cost_amount?: number | null;
  fee_asset?: string | null; fee_amount?: number | null; linked_tx_id?: string | null;
}

async function tx(d: TxDatos): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount,
       fee_asset, fee_amount, wallet_id, linked_tx_id)
     VALUES ($1, $2::operation_type, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, d.operation_type, d.timestamp, d.asset, d.amount, d.amount_net ?? d.amount, d.cost_asset ?? null,
     d.cost_amount ?? null, d.fee_asset ?? null, d.fee_amount ?? null, walletId, d.linked_tx_id ?? null],
  );
  return id;
}

/** Consumos de un activo: [transmisión, coste, resultado]. */
async function consumos(asset: string): Promise<number[][]> {
  const r = await db.query(
    `SELECT c.proceeds_eur, c.cost_basis_consumed_eur, c.gain_loss_eur
     FROM fifo_lot_consumptions c JOIN fifo_lots l ON l.id = c.lot_id
     WHERE l.asset = $1 ORDER BY c.consumed_at`, [asset]);
  return r.rows.map((x: Record<string, string>) => [Number(x.proceeds_eur), Number(x.cost_basis_consumed_eur), Number(x.gain_loss_eur)]);
}

async function lote(asset: string): Promise<{ cantidad: number; coste: number; comision: number }> {
  const r = await db.query(`SELECT quantity_original, cost_basis_eur, fee_eur FROM fifo_lots WHERE asset = $1`, [asset]);
  return { cantidad: Number(r.rows[0].quantity_original), coste: Number(r.rows[0].cost_basis_eur), comision: Number(r.rows[0].fee_eur) };
}

describe('comisiones de una orden en el FIFO (#543)', () => {
  it('compra con comisión en especie: el coste es lo entregado y la transmisión de lo entregado no incluye la comisión', async () => {
    await tx({ operation_type: 'BUY', timestamp: '2024-01-01T00:00:00Z', asset: 'USDT', amount: 1000, cost_asset: 'EUR', cost_amount: 1000 });
    // Compra 10 BTC pagando 1000 USDT; 0,1 BTC de comisión (llegan 9,9).
    await tx({ operation_type: 'BUY', timestamp: '2024-02-01T00:00:00Z', asset: 'BTC', amount: 10, amount_net: 9.9,
      cost_asset: 'USDT', cost_amount: 1000, fee_asset: 'BTC', fee_amount: 0.1 });
    expect((await runFifoEngine()).errors).toEqual([]);

    expect(await lote('BTC')).toEqual({ cantidad: 9.9, coste: 1000, comision: 10 });
    // Se entregan 1000 USDT que valen 1000 €: ni un euro más.
    expect(await consumos('USDT')).toEqual([[1000, 1000, 0]]);
  });

  it('compra con comisión en BNB enlazada: suma al coste y el BNB se consume en su propia fila', async () => {
    await tx({ operation_type: 'BUY', timestamp: '2024-01-01T00:00:00Z', asset: 'USDT', amount: 1000, cost_asset: 'EUR', cost_amount: 1000 });
    await tx({ operation_type: 'BUY', timestamp: '2024-01-01T00:00:00Z', asset: 'BNB', amount: 1, cost_asset: 'EUR', cost_amount: 400 });
    const compra = await tx({ operation_type: 'BUY', timestamp: '2024-02-01T00:00:00Z', asset: 'BTC', amount: 10, amount_net: 9.9,
      cost_asset: 'USDT', cost_amount: 1000, fee_asset: 'BTC', fee_amount: 0.1 });
    await tx({ operation_type: 'FEE_EXCHANGE', timestamp: '2024-02-01T00:00:00Z', asset: 'BNB', amount: 0.01, linked_tx_id: compra });
    expect((await runFifoEngine()).errors).toEqual([]);

    // 1000 € de lo entregado + 5 € de BNB; comisión total 10 € (especie) + 5 € (BNB).
    expect(await lote('BTC')).toEqual({ cantidad: 9.9, coste: 1005, comision: 15 });
    expect(await consumos('USDT')).toEqual([[1000, 1000, 0]]);
    // Entregar 0,01 BNB: transmisión 5 €, coste 4 €.
    expect(await consumos('BNB')).toEqual([[5, 4, 1]]);
  });

  it('venta con comisión en BNB enlazada: se resta de lo obtenido; el lote recibido conserva su valor', async () => {
    await tx({ operation_type: 'BUY', timestamp: '2024-01-01T00:00:00Z', asset: 'BTC', amount: 1, cost_asset: 'EUR', cost_amount: 100 });
    await tx({ operation_type: 'BUY', timestamp: '2024-01-01T00:00:00Z', asset: 'BNB', amount: 1, cost_asset: 'EUR', cost_amount: 400 });
    // Vende 1 BTC por 150 USDT con 1 USDT de comisión en el par y 0,01 BNB (5 €) enlazado.
    const venta = await tx({ operation_type: 'SELL', timestamp: '2024-02-01T00:00:00Z', asset: 'BTC', amount: 1,
      cost_asset: 'USDT', cost_amount: 150, fee_asset: 'USDT', fee_amount: 1 });
    await tx({ operation_type: 'FEE_EXCHANGE', timestamp: '2024-02-01T00:00:00Z', asset: 'BNB', amount: 0.01, linked_tx_id: venta });
    expect((await runFifoEngine()).errors).toEqual([]);

    // 150 - 1 (USDT) - 5 (BNB) = 144 de transmisión neta; coste 100.
    expect(await consumos('BTC')).toEqual([[144, 100, 44]]);
    // Llegan 149 USDT valorados a lo que vale lo recibido (sin la comisión en BNB).
    const usdt = await lote('USDT');
    expect(usdt.cantidad).toBeCloseTo(149, 9);
    expect(usdt.coste).toBeCloseTo(149, 9);
    expect(await consumos('BNB')).toEqual([[5, 4, 1]]);
  });

  it('compra con EUR y comisión incluida en el precio (Bitvavo): mismo coste, comisión aparte en el lote', async () => {
    const id = await tx({ operation_type: 'BUY', timestamp: '2024-02-01T00:00:00Z', asset: 'XRP', amount: 100, cost_asset: 'EUR', cost_amount: 50 });
    await db.query(`UPDATE transactions SET included_fee_asset = 'EUR', included_fee_amount = 0.13 WHERE id = $1`, [id]);
    expect((await runFifoEngine()).errors).toEqual([]);
    const l = await lote('XRP');
    expect(l.cantidad).toBe(100);
    expect(l.coste).toBe(50);
    expect(l.comision).toBeCloseTo(0.13, 9);
  });

  it('una FEE_EXCHANGE sin enlazar no cambia la venta (comisión suelta, como antes)', async () => {
    await tx({ operation_type: 'BUY', timestamp: '2024-01-01T00:00:00Z', asset: 'BTC', amount: 1, cost_asset: 'EUR', cost_amount: 100 });
    await tx({ operation_type: 'BUY', timestamp: '2024-01-01T00:00:00Z', asset: 'BNB', amount: 1, cost_asset: 'EUR', cost_amount: 400 });
    await tx({ operation_type: 'SELL', timestamp: '2024-02-01T00:00:00Z', asset: 'BTC', amount: 1, cost_asset: 'EUR', cost_amount: 150 });
    await tx({ operation_type: 'FEE_EXCHANGE', timestamp: '2024-02-01T00:00:00Z', asset: 'BNB', amount: 0.01 });
    expect((await runFifoEngine()).errors).toEqual([]);
    expect(await consumos('BTC')).toEqual([[150, 100, 50]]);
  });
});
