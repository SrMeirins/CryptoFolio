import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 016 (#374): fila original del CSV por hash. La base de test se
// crea desde schema.sql, que ya incluye los cambios. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/016_filas_originales.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/016_filas_originales.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
let importId: string;
let n = 0;
const insert = (original: string | null) => pool.query(
  `INSERT INTO raw_transactions (import_id, user_id, time, account, operation, coin, change, row_hash, original_row)
   VALUES ($1, '', NOW(), 'Spot', 'BUY', 'SINT', 1, $2, $3::jsonb)`, [importId, `rh-016-${n++}`, original]);
const columnas = async () => (await pool.query(
  `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'raw_transactions' AND column_name = 'original_row'`)).rows[0].n;

describe('migración 016_filas_originales', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    importId = (await pool.query(`INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('m.csv', 'h-016', 'binance') RETURNING id`)).rows[0].id;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente; solo admite un objeto sin User ID', async () => {
    await pool.query(up);
    await pool.query(up);
    await insert('{"Coin": "SINT"}');
    await insert(null);
    await expect(insert('{"User ID": "1"}')).rejects.toThrow();
    await expect(insert('[1]')).rejects.toThrow();
  });

  it('la reversión quita la columna y conserva los hashes; volver a aplicarla la recrea', async () => {
    const before = (await pool.query('SELECT count(*)::int AS n FROM raw_transactions')).rows[0].n;
    await pool.query(down);
    expect(await columnas()).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM raw_transactions')).rows[0].n).toBe(before);
    await pool.query(up);
    expect(await columnas()).toBe(1);
    await insert('{"Coin": "SINT"}');
  });
});
