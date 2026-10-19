import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 008 (#311): ejercicios declarados. La base de test se crea desde
// schema.sql, que ya incluye la tabla. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/008_fiscal_declaraciones.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/008_fiscal_declaraciones.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const exists = async () => (await pool.query(`SELECT to_regclass('fiscal_declaraciones') AS t`)).rows[0].t !== null;

describe('migración 008_fiscal_declaraciones', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y valida tipo, ejercicio y cifras', async () => {
    await pool.query(up);
    await pool.query(`INSERT INTO fiscal_declaraciones (ejercicio, tipo, cifras) VALUES (2024, 'renta', '{"neto": 1}')`);
    await expect(pool.query(`INSERT INTO fiscal_declaraciones (ejercicio, tipo, cifras) VALUES (2024, 'otro', '{}')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO fiscal_declaraciones (ejercicio, tipo, cifras) VALUES (1990, 'renta', '{}')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO fiscal_declaraciones (ejercicio, tipo, cifras) VALUES (2025, 'renta', '[]')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO fiscal_declaraciones (ejercicio, tipo, cifras) VALUES (2024, 'renta', '{}')`)).rejects.toThrow();
  });

  it('la reversión elimina la tabla y volver a aplicarla la recrea vacía', async () => {
    await pool.query(down);
    expect(await exists()).toBe(false);
    await pool.query(up);
    expect(await exists()).toBe(true);
    expect((await pool.query(`SELECT count(*)::int AS n FROM fiscal_declaraciones`)).rows[0].n).toBe(0);
  });
});
