import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 003 (#174): columna usd_per_eur en fifo_lots, idempotente y reversible.
const up = readFileSync(path.join(__dirname, 'migrations/003_fifo_lots_usd_per_eur.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/003_fifo_lots_usd_per_eur.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;

const hasColumn = async () => (await pool.query(
  `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fifo_lots' AND column_name = 'usd_per_eur') AS e`,
)).rows[0].e as boolean;

describe('migración 003_fifo_lots_usd_per_eur', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente sobre un esquema que ya tiene la columna', async () => {
    await pool.query(up);
    await pool.query(up);
    expect(await hasColumn()).toBe(true);
  });

  it('la reversión elimina la columna y volver a aplicarla la recrea', async () => {
    await pool.query(down);
    expect(await hasColumn()).toBe(false);
    await pool.query(up);
    expect(await hasColumn()).toBe(true);
  });

  it('rechaza tipos no positivos', async () => {
    await expect(pool.query(`ALTER TABLE fifo_lots VALIDATE CONSTRAINT chk_fifo_lots_usd_per_eur_pos`)).resolves.toBeDefined();
    const def = await pool.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'chk_fifo_lots_usd_per_eur_pos'`);
    expect(def.rows[0].d).toContain('usd_per_eur > ');
  });
});
