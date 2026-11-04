import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Comisión de red en traspasos a wallets propias (#532): transmisión (por
// defecto) o sumada al coste de las unidades que llegan. Datos sintéticos;
// precio de mercado fijo de 100 por unidad.
vi.mock('../prices/binance', () => ({
  getHistoricalPriceEur: vi.fn(() => Promise.resolve(100)),
}));

let testDb: TestDatabase;
let db: typeof import('../../db/client')['db'];
let pool: typeof import('../../db/client')['pool'];
let runFifoEngine: typeof import('./engine')['runFifoEngine'];
const W = { spot: '', fria: '', externa: '' };

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
  const dbClient = await import('../../db/client');
  db = dbClient.db;
  pool = dbClient.pool;
  ({ runFifoEngine } = await import('./engine'));
  W.spot = (await db.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
  W.externa = (await db.query(`SELECT id FROM wallets WHERE name = 'Wallets externas'`)).rows[0].id;
  W.fria = (await db.query(`INSERT INTO wallets (name, type) VALUES ('Fría sintética', 'hardware') RETURNING id`)).rows[0].id;
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
  await db.query(`DELETE FROM app_config WHERE key = 'fifo_comision_red_traspaso'`);
});

async function tx(f: { op: string; ts: string; amount: number; cost?: number; wallet: string; dest?: string; fee?: number }) {
  await db.query(
    `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, fee_asset, fee_amount, wallet_id, destination_wallet_id, destination_pending, account)
     VALUES ($1, $2::operation_type, $3, 'AAA', $4, $4, $5, $6, $7, $8, $9, $10, FALSE, 'Spot')`,
    [randomUUID(), f.op, f.ts, f.amount, f.cost ? 'EUR' : null, f.cost ?? null, f.fee ? 'AAA' : null, f.fee ?? null, f.wallet, f.dest ?? null],
  );
}

/** Compra 1 AAA por 50 € y traspasa 0,99 con 0,01 de comisión de red. */
async function escenario(dest: string) {
  await tx({ op: 'BUY', ts: '2024-01-01T00:00:00Z', amount: 1, cost: 50, wallet: W.spot });
  await tx({ op: 'WITHDRAW', ts: '2024-02-01T00:00:00Z', amount: 0.99, wallet: W.spot, dest, fee: 0.01 });
}

const fiscales = async () => (await db.query(
  `SELECT COUNT(*)::int AS n, COALESCE(SUM(gain_loss_eur), 0)::float AS g FROM fifo_lot_consumptions WHERE fiscal_event_type <> 'NONE'`)).rows[0];
const abierto = async (wallet: string) => (await db.query(
  `SELECT COALESCE(SUM(quantity_remaining), 0)::float AS q, COALESCE(SUM(cost_basis_eur), 0)::float AS c, COALESCE(SUM(fee_eur), 0)::float AS f
   FROM fifo_lots WHERE wallet_id = $1 AND NOT is_closed`, [wallet])).rows[0];

describe('comisión de red en traspasos propios (#532)', () => {
  it('por defecto (transmisión): la comisión genera ganancia o pérdida, como hasta ahora', async () => {
    await escenario(W.fria);
    await runFifoEngine();
    const f = await fiscales();
    expect(f.n).toBe(1);
    expect(f.g).toBeCloseTo(0.01 * 100 - 0.01 * 50, 9); // vende 0,01 a 100 con coste 50
    expect((await abierto(W.fria)).c).toBeCloseTo(0.99 * 50, 9);
  });

  it('sumar al coste: sin efecto fiscal y el coste total se conserva en el destino', async () => {
    await db.query(`INSERT INTO app_config (key, value) VALUES ('fifo_comision_red_traspaso', 'coste')`);
    await escenario(W.fria);
    const r = await runFifoEngine();
    expect(r.errors).toEqual([]);
    expect((await fiscales()).n).toBe(0);
    const fria = await abierto(W.fria);
    expect(fria.q).toBeCloseTo(0.99, 12);
    expect(fria.c).toBeCloseTo(50, 9);          // coste de las 0,99 más el de la comisión
    expect(fria.f).toBeCloseTo(0.01 * 50, 9);   // la comisión queda como gasto de adquisición
    expect((await abierto(W.spot)).q).toBeCloseTo(0, 12);
  });

  it('sumar al coste reparte la comisión en proporción entre varios lotes que llegan', async () => {
    await db.query(`INSERT INTO app_config (key, value) VALUES ('fifo_comision_red_traspaso', 'coste')`);
    await tx({ op: 'BUY', ts: '2024-01-01T00:00:00Z', amount: 0.5, cost: 20, wallet: W.spot });
    await tx({ op: 'BUY', ts: '2024-01-02T00:00:00Z', amount: 1, cost: 60, wallet: W.spot });
    // Comisión 0,1 (sale del lote antiguo, coste 4); se mueven 1,4: 0,4 del antiguo y 1 del nuevo.
    await tx({ op: 'WITHDRAW', ts: '2024-02-01T00:00:00Z', amount: 1.4, wallet: W.spot, dest: W.fria, fee: 0.1 });
    await runFifoEngine();
    const lotes = (await db.query(
      `SELECT quantity_remaining::float AS q, cost_basis_eur::float AS c, fee_eur::float AS f FROM fifo_lots
       WHERE wallet_id = $1 ORDER BY opened_at`, [W.fria])).rows;
    expect(lotes).toHaveLength(2);
    expect(lotes[0].q).toBeCloseTo(0.4, 12);
    expect(lotes[1].q).toBeCloseTo(1, 12);
    expect(lotes[0].f).toBeCloseTo(4 * 0.4 / 1.4, 9);
    expect(lotes[1].f).toBeCloseTo(4 * 1 / 1.4, 9);
    expect(lotes.reduce((s, l) => s + l.c, 0)).toBeCloseTo(80, 9); // coste total conservado
  });

  it('hacia «Wallets externas» la comisión siempre es transmisión', async () => {
    await db.query(`INSERT INTO app_config (key, value) VALUES ('fifo_comision_red_traspaso', 'coste')`);
    await escenario(W.externa);
    await runFifoEngine();
    expect((await fiscales()).n).toBe(1);
  });
});
