import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

let testDb: TestDatabase;
let pool: Pool;
let db: typeof import('../../db/client')['db'];
let runFifoEngine: typeof import('../fifo/engine')['runFifoEngine'];
let spotWalletId: string;
let crossMarginWalletId: string;

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

async function loadImporterWithTestDb() {
  process.env.DATABASE_URL = testDb.connectionString;
  const dbClient = await import('../../db/client');
  db = dbClient.db;
  ({ runFifoEngine } = await import('../fifo/engine'));
  return import('./importer');
}

// Regresión del bug real encontrado 2026-09-29: el hash usado en importer.ts
// para casar la fila de salida de un "Inter-Wallet Transfer" con su fila de
// entrada (y así resolver la wallet destino) usaba una fórmula distinta a la
// de parser.ts (Remark en vez de occurrenceIndex) — nunca coincidían, así que
// TODAS las transferencias internas de Binance se quedaban sin destino y el
// lote se quedaba intacto en la wallet de origen para siempre (verificado
// contra datos reales del usuario: cientos de miles de unidades "fantasma").
describe('importCsvFile — resolución de wallet destino en Inter-Wallet Transfer', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('mueve el lote de la wallet origen a la wallet destino real, no lo deja huérfano en origen', async () => {
    const { importCsvFile } = await loadImporterWithTestDb();

    const spotRes = await db.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`);
    spotWalletId = spotRes.rows[0].id;
    const crossRes = await db.query(`SELECT id FROM wallets WHERE name = 'Binance Cross Margin'`);
    crossMarginWalletId = crossRes.rows[0].id;

    // Lote previo real en Spot, como si viniera de una compra ya importada.
    const priorTxId = randomUUID();
    await db.query(
      `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id, account)
       VALUES ($1, 'BUY', '2024-05-01T00:00:00Z', 'LUNC', 1000, 1000, 'EUR', 100, $2, 'Spot')`,
      [priorTxId, spotWalletId]
    );
    await db.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, fee_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('LUNC', 1000, 1000, 100, 0.1, 0, $1, '2024-05-01T00:00:00Z', $2)`,
      [priorTxId, spotWalletId]
    );

    // Par real de Inter-Wallet Transfer: LUNC sale de Spot y entra en Cross Margin.
    const rows = [
      '123,2024-05-10 10:00:00,Spot,Inter-Wallet Transfer,LUNC,-1000,',
      '123,2024-05-10 10:00:00,Cross Margin,Inter-Wallet Transfer,LUNC,1000,',
    ];
    const result = await importCsvFile(Buffer.from(csv(rows), 'utf-8'), 'test.csv');
    expect(result.errors ?? []).toEqual([]);

    const tx = await db.query(
      `SELECT destination_wallet_id, destination_pending FROM transactions
       WHERE operation_type = 'TRANSFER_INTERNAL' AND asset = 'LUNC' AND wallet_id = $1`,
      [spotWalletId]
    );
    expect(tx.rows).toHaveLength(1);
    // Antes del fix: destination_wallet_id quedaba NULL (hash nunca casaba).
    expect(tx.rows[0].destination_wallet_id).toBe(crossMarginWalletId);
    expect(tx.rows[0].destination_pending).toBe(false);

    const fifoResult = await runFifoEngine();
    expect(fifoResult.errors).toEqual([]);

    const spotLot = await db.query(
      `SELECT quantity_remaining, is_closed FROM fifo_lots WHERE asset = 'LUNC' AND wallet_id = $1`,
      [spotWalletId]
    );
    expect(Number(spotLot.rows[0].quantity_remaining)).toBeCloseTo(0, 6);
    expect(spotLot.rows[0].is_closed).toBe(true);

    const crossLot = await db.query(
      `SELECT quantity_remaining FROM fifo_lots WHERE asset = 'LUNC' AND wallet_id = $1`,
      [crossMarginWalletId]
    );
    expect(crossLot.rows).toHaveLength(1);
    expect(Number(crossLot.rows[0].quantity_remaining)).toBeCloseTo(1000, 6);
  });
});
