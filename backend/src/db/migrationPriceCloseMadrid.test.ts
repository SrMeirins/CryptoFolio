import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 001 (price_close_madrid, #164): idempotente, reversible y con sus
// restricciones. La base de test se crea desde schema.sql, que ya incluye la tabla.
const up = readFileSync(path.join(__dirname, 'migrations/001_price_close_madrid.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/001_price_close_madrid.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;

const tableExists = async () =>
  (await pool.query(`SELECT to_regclass('public.price_close_madrid') IS NOT NULL AS exists`)).rows[0].exists as boolean;

describe('migración 001_price_close_madrid', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente sobre un esquema que ya tiene la tabla (instalación nueva)', async () => {
    expect(await tableExists()).toBe(true);
    await expect(pool.query(up)).resolves.toBeDefined();
  });

  it('la reversión elimina la tabla y volver a aplicarla la recrea', async () => {
    await pool.query(down);
    expect(await tableExists()).toBe(false);
    await pool.query(up);
    expect(await tableExists()).toBe(true);
  });

  it('acepta precios positivos y la marca -1 solo con source = none', async () => {
    await pool.query(`INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES ('XRP', '2026-01-15', 2.5, 'binance_1h')`);
    await pool.query(`INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES ('RARO', '2026-01-15', -1, 'none')`);

    await expect(pool.query(`INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES ('BAD1', '2026-01-15', -1, 'binance_1h')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES ('BAD2', '2026-01-15', 0, 'binance_1h')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES ('BAD3', '2026-01-15', 1, 'otra')`)).rejects.toThrow();
  });

  it('un activo solo tiene un cierre por día', async () => {
    await expect(pool.query(`INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES ('XRP', '2026-01-15', 2.6, 'binance_1h')`)).rejects.toThrow();
  });
});
