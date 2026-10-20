import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 009 (#320): destino on-chain de los retiros. La base de test se crea
// desde schema.sql, que ya incluye las columnas. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/009_retiro_direccion.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/009_retiro_direccion.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const columnas = async () => (await pool.query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name = 'transactions' AND column_name IN ('counterparty_address', 'counterparty_network_id', 'tx_hash')
   ORDER BY column_name`,
)).rows.map((r: { column_name: string }) => r.column_name);

describe('migración 009_retiro_direccion', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y limita la longitud de dirección y hash', async () => {
    await pool.query(up);
    expect(await columnas()).toEqual(['counterparty_address', 'counterparty_network_id', 'tx_hash']);
    const w = (await pool.query(`SELECT id FROM wallets LIMIT 1`)).rows[0].id;
    const insertar = (dir: string) => pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, counterparty_address)
       VALUES ('WITHDRAW', now(), 'XRP', 1, 1, $1, $2)`, [w, dir]);
    await insertar('rSintetica123');
    await expect(insertar('x'.repeat(129))).rejects.toThrow();
  });

  it('la reversión quita las columnas y volver a aplicarla las recrea', async () => {
    await pool.query(down);
    expect(await columnas()).toEqual([]);
    await pool.query(up);
    expect(await columnas()).toHaveLength(3);
  });
});
