import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 013 (#378): copia del original de las importadas editadas. La base
// de test se crea desde schema.sql, que ya incluye los cambios. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/013_transacciones_editadas.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/013_transacciones_editadas.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
let walletId: string;
const insert = (manual: boolean, original: string | null) => pool.query(
  `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, manually_added, original_import)
   VALUES ('DEPOSIT_CRYPTO', NOW(), 'SINT', 1, 1, $1, $2, $3::jsonb)`, [walletId, manual, original]);

describe('migración 013_transacciones_editadas', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Migración test', 'hardware') RETURNING id`)).rows[0].id;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente; solo una importada guarda un objeto como original', async () => {
    await pool.query(up);
    await pool.query(up);
    await insert(false, '{"amount": 1}');
    await insert(false, null);
    await expect(insert(true, '{"amount": 1}')).rejects.toThrow();
    await expect(insert(false, '[1, 2]')).rejects.toThrow();
  });

  it('la reversión quita la columna y conserva las transacciones; volver a aplicarla la recrea', async () => {
    const before = (await pool.query('SELECT count(*)::int AS n FROM transactions')).rows[0].n;
    await pool.query(down);
    expect((await pool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'original_import'`)).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM transactions')).rows[0].n).toBe(before);
    await pool.query(up);
    await insert(false, '{"amount": 2}');
  });
});
