import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 010 (#328): revisiones de cobertura. La base de test se crea desde
// schema.sql, que ya incluye la tabla. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/010_cobertura_revisiones.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/010_cobertura_revisiones.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const existe = async () => (await pool.query(`SELECT to_regclass('cobertura_revisiones') AS t`)).rows[0].t !== null;

describe('migración 010_cobertura_revisiones', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y valida exchange, tipo y rango', async () => {
    await pool.query(up);
    await pool.query(`INSERT INTO cobertura_revisiones (exchange, tipo, desde, hasta) VALUES ('binance', 'hueco', '2024-01-01', '2024-02-01')`);
    await expect(pool.query(`INSERT INTO cobertura_revisiones (exchange, tipo, desde, hasta) VALUES ('kraken', 'hueco', '2024-01-01', '2024-02-01')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO cobertura_revisiones (exchange, tipo, desde, hasta) VALUES ('binance', 'otro', '2024-01-01', '2024-02-01')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO cobertura_revisiones (exchange, tipo, desde, hasta) VALUES ('binance', 'hueco', '2024-03-01', '2024-02-01')`)).rejects.toThrow();
  });

  it('la reversión elimina la tabla y volver a aplicarla la recrea vacía', async () => {
    await pool.query(down);
    expect(await existe()).toBe(false);
    await pool.query(up);
    expect((await pool.query(`SELECT count(*)::int AS n FROM cobertura_revisiones`)).rows[0].n).toBe(0);
  });
});
