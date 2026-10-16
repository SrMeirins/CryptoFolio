import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 005 (#257): LOST/GIFT_SENT dejan de estar marcadas con destino pendiente.
const up = readFileSync(path.join(__dirname, 'migrations/005_lost_gift_not_pending.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/005_lost_gift_not_pending.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;

const flags = async () => (await pool.query(
  `SELECT asset || '=' || operation_type::text || ':' || destination_pending AS f FROM transactions ORDER BY asset`,
)).rows.map((r: { f: string }) => r.f);

describe('migración 005_lost_gift_not_pending', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    const wallet = (await pool.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
    for (const [asset, op] of [['ADA', 'GIFT_SENT'], ['DOT', 'WITHDRAW'], ['XRP', 'LOST']]) {
      await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, destination_pending)
         VALUES ($1::operation_type, '2024-05-10T10:00:00Z', $2, 10, 10, $3, TRUE)`,
        [op, asset, wallet],
      );
    }
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('desmarca LOST y GIFT_SENT, no toca las WITHDRAW pendientes y es idempotente', async () => {
    await pool.query(up);
    await pool.query(up);
    expect(await flags()).toEqual(['ADA=GIFT_SENT:false', 'DOT=WITHDRAW:true', 'XRP=LOST:false']);
  });

  it('la reversión restaura la regla antigua del importador', async () => {
    await pool.query(down);
    expect(await flags()).toEqual(['ADA=GIFT_SENT:true', 'DOT=WITHDRAW:true', 'XRP=LOST:true']);
  });
});
