import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 014 (#380): déficits del motor FIFO. La base de test se crea desde
// schema.sql, que ya incluye la tabla. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/014_fifo_shortfalls.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/014_fifo_shortfalls.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
let walletId: string;
let txId: string;
const insert = (requested: number, missing: number) => pool.query(
  `INSERT INTO fifo_shortfalls (transaction_id, asset, wallet_id, requested, missing) VALUES ($1, 'SINT', $2, $3, $4)`,
  [txId, walletId, requested, missing]);

describe('migración 014_fifo_shortfalls', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Migración 014', 'hardware') RETURNING id`)).rows[0].id;
    txId = (await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id) VALUES ('SELL', NOW(), 'SINT', 1, 1, $1) RETURNING id`,
      [walletId])).rows[0].id;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y rechaza déficits incoherentes', async () => {
    await pool.query(up);
    await pool.query(up);
    await insert(10, 4);
    await expect(insert(10, 11)).rejects.toThrow();
    await expect(insert(10, 0)).rejects.toThrow();
  });

  it('borrar la transacción borra su déficit', async () => {
    await pool.query('DELETE FROM fifo_shortfalls');
    await insert(5, 5);
    await pool.query('DELETE FROM transactions WHERE id = $1', [txId]);
    expect((await pool.query('SELECT count(*)::int AS n FROM fifo_shortfalls')).rows[0].n).toBe(0);
  });

  it('la reversión quita la tabla; volver a aplicarla la recrea', async () => {
    await pool.query(down);
    expect((await pool.query(`SELECT to_regclass('fifo_shortfalls') AS t`)).rows[0].t).toBeNull();
    await pool.query(up);
    expect((await pool.query(`SELECT to_regclass('fifo_shortfalls') AS t`)).rows[0].t).toBe('fifo_shortfalls');
  });
});
