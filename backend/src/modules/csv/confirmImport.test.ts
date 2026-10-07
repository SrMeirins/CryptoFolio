import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// confirmImport.ts no tenía test propio — vivía como lógica inline dentro
// del endpoint /confirm de routes/imports.ts, sin ningún test. Las funciones
// que tocan db/client.ts se importan dinámicamente DESPUÉS de fijar
// DATABASE_URL (nunca como import estático de este fichero) — un import
// estático se evalúa durante la recolección de vitest, antes de que el
// beforeAll fije DATABASE_URL al valor de test, y db/client.ts cachearía el
// Pool contra la BD equivocada (mismo patrón ya documentado en
// modules/fifo/engine.test.ts y confirmado empíricamente en el turno de
// routes/fifo/).
const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

let testDb: TestDatabase;
let pool: Pool;
let confirmImport: typeof import('./confirmImport');

describe('confirmImport — gates y split de depositCosts', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    confirmImport = await import('./confirmImport');
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  describe('checkPreImportDepositGate', () => {
    it('bloquea si el CSV trae un depósito cripto externo sin coste asignado', async () => {
      const buffer = Buffer.from(csv(['123,2024-05-10 10:00:00,Spot,Deposit,BTC,1,']), 'utf-8');
      const result = await confirmImport.checkPreImportDepositGate('binance', buffer, {});
      expect(result.blocked).toBe(true);
      expect(result.missingCount).toBe(1);
    });

    it('no bloquea si el depósito ya trae coste asignado en este envío', async () => {
      const buffer = Buffer.from(csv(['123,2024-05-11 10:00:00,Spot,Deposit,BTC,1,']), 'utf-8');
      const preparse = await confirmImport.checkPreImportDepositGate('binance', buffer, {});
      const hash = preparse.preparse.transactions.find(tx => tx.needsCostReview)!.rawRowHashes[0];
      const result = await confirmImport.checkPreImportDepositGate('binance', buffer, { [hash]: 30000 });
      expect(result.blocked).toBe(false);
      expect(result.missingCount).toBe(0);
    });

    it('un depósito fiat (EUR) no activa el gate', async () => {
      const buffer = Buffer.from(csv(['123,2024-05-12 10:00:00,Spot,Deposit,EUR,100,']), 'utf-8');
      const result = await confirmImport.checkPreImportDepositGate('binance', buffer, {});
      expect(result.blocked).toBe(false);
    });
  });

  describe('checkPendingDepositGate', () => {
    it('bloquea si hay una transacción en BD con la nota de depósito externo y sin price_per_unit', async () => {
      const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet gate test', 'hardware') RETURNING id`);
      await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, notes)
         VALUES ('DEPOSIT_CRYPTO', NOW(), 'BTC', 1, 1, $1, 'Depósito de cripto externo — pendiente')`,
        [wallet.rows[0].id]
      );
      const result = await confirmImport.checkPendingDepositGate();
      expect(result.blocked).toBe(true);
      expect(result.missingCount).toBeGreaterThanOrEqual(1);
    });

    it('no bloquea si no hay ninguna transacción pendiente de coste', async () => {
      await pool.query(`DELETE FROM transactions WHERE notes LIKE '%Depósito de cripto externo%'`);
      const result = await confirmImport.checkPendingDepositGate();
      expect(result).toEqual({ blocked: false, missingCount: 0 });
    });
  });

  describe('splitDepositCosts', () => {
    it('separa claves UUID (ya en DB) de claves hash (nuevas en CSV), descartando null', () => {
      const uuid = '11111111-1111-1111-1111-111111111111';
      const { existingDepositUpdates, newDepositCosts } = confirmImport.splitDepositCosts({
        [uuid]: 100,
        'hash-nuevo': 200,
        'hash-desconocido': null,
      });
      expect(existingDepositUpdates).toEqual([{ id: uuid, pricePerUnit: 100 }]);
      expect(newDepositCosts).toEqual({ 'hash-nuevo': 200 });
    });
  });

  describe('applyExistingDepositCostUpdates', () => {
    it('actualiza price_per_unit y cost_amount = amount * pricePerUnit', async () => {
      const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet update test', 'hardware') RETURNING id`);
      const tx = await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
         VALUES ('DEPOSIT_CRYPTO', NOW(), 'BTC', 2, 2, $1) RETURNING id`,
        [wallet.rows[0].id]
      );

      await confirmImport.applyExistingDepositCostUpdates([{ id: tx.rows[0].id, pricePerUnit: 30000 }]);

      const updated = await pool.query('SELECT price_per_unit, cost_amount FROM transactions WHERE id = $1', [tx.rows[0].id]);
      expect(Number(updated.rows[0].price_per_unit)).toBe(30000);
      expect(Number(updated.rows[0].cost_amount)).toBe(60000);
    });

    it('con lista vacía, no hace nada', async () => {
      await expect(confirmImport.applyExistingDepositCostUpdates([])).resolves.toBeUndefined();
    });
  });
});
