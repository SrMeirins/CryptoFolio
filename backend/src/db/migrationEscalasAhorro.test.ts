import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 019 (#452): tipos IRPF por ejercicio. Idempotente, reversible, con
// sus restricciones, y la escala de app_config pasa al ejercicio en curso.
const up = readFileSync(path.join(__dirname, 'migrations/019_escalas_ahorro.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/019_escalas_ahorro.sql'), 'utf8');
let testDb: TestDatabase;
let pool: Pool;
const exists = async () => (await pool.query(`SELECT to_regclass('public.irpf_escalas') IS NOT NULL AS e`)).rows[0].e as boolean;

describe('migración 019_escalas_ahorro', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y rechaza tipos fuera de rango', async () => {
    await pool.query(up);
    await pool.query(up);
    expect(await exists()).toBe(true);
    for (const tipos of ['{0,21}', '{101}', '{}']) {
      await expect(pool.query(`INSERT INTO irpf_escalas (ejercicio, tipos) VALUES (2024, $1)`, [tipos])).rejects.toThrow();
    }
  });

  it('pasa la escala guardada en app_config al ejercicio en curso', async () => {
    await pool.query(down);
    await pool.query(`INSERT INTO app_config (key, value) VALUES ('irpf_tramos_tipos', '[20,22,24,28,31]') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    await pool.query(up);
    const row = (await pool.query(`SELECT ejercicio, tipos::float8[] AS tipos FROM irpf_escalas`)).rows[0];
    expect(row).toEqual({ ejercicio: new Date().getFullYear(), tipos: [20, 22, 24, 28, 31] });
  });

  it('la reversión quita la tabla y se puede volver a aplicar', async () => {
    await pool.query(down);
    expect(await exists()).toBe(false);
    await pool.query(up);
    expect(await exists()).toBe(true);
  });
});
