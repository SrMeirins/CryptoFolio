import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 025 (#544): lote de origen de cada traslado en fifo_lots.
const up = readFileSync(path.join(__dirname, 'migrations/025_lote_origen.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/025_lote_origen.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;

const columna = async () => (await pool.query(
  `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'fifo_lots' AND column_name = 'origin_lot_id'`)).rows[0].n;
const indice = async () => (await pool.query(`SELECT to_regclass('idx_fifo_lots_origin') AS i`)).rows[0].i;

describe('migración 025_lote_origen', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente sobre un esquema que ya la incluye', async () => {
    await pool.query(up);
    await pool.query(up);
    expect(await columna()).toBe(1);
    expect(await indice()).toBe('idx_fifo_lots_origin');
  });

  it('la reversión quita la columna y el índice, y se puede volver a aplicar', async () => {
    await pool.query(down);
    expect(await columna()).toBe(0);
    expect(await indice()).toBeNull();
    await pool.query(up);
    expect(await columna()).toBe(1);
  });
});
