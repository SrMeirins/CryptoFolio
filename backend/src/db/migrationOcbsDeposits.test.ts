import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 002 (#169): depósitos OCBS importados como IGNORED → DEPOSIT_FIAT.
const up = readFileSync(path.join(__dirname, 'migrations/002_ocbs_deposits_as_deposit_fiat.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/002_ocbs_deposits_as_deposit_fiat.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;

const types = async () => (await pool.query(
  `SELECT notes, operation_type::text AS op FROM transactions ORDER BY notes`,
)).rows.map((r: { notes: string; op: string }) => `${r.notes}=${r.op}`);

describe('migración 002_ocbs_deposits_as_deposit_fiat', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    const wallet = (await pool.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
    for (const notes of ['Deposit Fiat OCBS', 'Fiat OCBS - Add Fiat and Fees', 'Fiat OCBS - Otro asiento']) {
      await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, notes)
         VALUES ('IGNORED', '2022-12-07T00:56:49Z', 'EUR', 58.86, 58.86, $1, $2)`,
        [wallet, notes],
      );
    }
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('convierte solo los depósitos OCBS y es idempotente', async () => {
    await pool.query(up);
    await pool.query(up);
    expect(await types()).toEqual([
      'Deposit Fiat OCBS=DEPOSIT_FIAT',
      'Fiat OCBS - Add Fiat and Fees=DEPOSIT_FIAT',
      'Fiat OCBS - Otro asiento=IGNORED',
    ]);
  });

  it('la reversión deja las filas como estaban', async () => {
    await pool.query(down);
    expect(await types()).toEqual([
      'Deposit Fiat OCBS=IGNORED',
      'Fiat OCBS - Add Fiat and Fees=IGNORED',
      'Fiat OCBS - Otro asiento=IGNORED',
    ]);
  });
});
