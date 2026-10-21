import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 011 (#336): motivo de los fallos de verificación. La base de test se
// crea desde schema.sql, que ya incluye la columna. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/011_sync_log_error.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/011_sync_log_error.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const tieneColumna = async () => (await pool.query(
  `SELECT 1 FROM information_schema.columns WHERE table_name = 'balance_sync_log' AND column_name = 'error'`)).rows.length === 1;

describe('migración 011_sync_log_error', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y limita la longitud del motivo', async () => {
    await pool.query(up);
    expect(await tieneColumna()).toBe(true);
    const w = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('W migración 011', 'hardware') RETURNING id`)).rows[0].id;
    const a = (await pool.query(`INSERT INTO wallet_addresses (wallet_id, custom_network, address) VALUES ($1, 'Sintética', 'rSintetica') RETURNING id`, [w])).rows[0].id;
    const ins = (e: string) => pool.query(`INSERT INTO balance_sync_log (wallet_address_id, asset, status, error) VALUES ($1, 'XRP', 'error', $2)`, [a, e]);
    await ins('falta API key');
    await expect(ins('x'.repeat(501))).rejects.toThrow();
  });

  it('la reversión quita la columna y volver a aplicarla la recrea', async () => {
    await pool.query(down);
    expect(await tieneColumna()).toBe(false);
    await pool.query(up);
    expect(await tieneColumna()).toBe(true);
  });
});
