import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 031 (#548): tipo y periodo de las importaciones. La base de test se
// crea desde schema.sql, que ya incluye las columnas. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/031_importacion_retiradas.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/031_importacion_retiradas.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const columnas = async () => (await pool.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'csv_imports' AND column_name IN ('tipo', 'periodo_desde', 'periodo_hasta')`,
)).rows.length;
const insertar = (hash: string, tipo: string, desde = 'NULL', hasta = 'NULL') =>
  pool.query(`INSERT INTO csv_imports (filename, file_hash, tipo, periodo_desde, periodo_hasta) VALUES ('f.csv', '${hash}', '${tipo}', ${desde}, ${hasta})`);

describe('migración 031_importacion_retiradas', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y valida el tipo y el rango del periodo', async () => {
    await pool.query(up);
    await pool.query(up);
    await insertar('h1', 'retiradas', `'2024-01-01'`, `'2024-02-01'`);
    await expect(insertar('h2', 'otro')).rejects.toThrow();
    await expect(insertar('h3', 'retiradas', `'2024-03-01'`, `'2024-02-01'`)).rejects.toThrow();
    const sinTipo = await pool.query(`INSERT INTO csv_imports (filename, file_hash) VALUES ('g.csv', 'h4') RETURNING tipo`);
    expect(sinTipo.rows[0].tipo).toBe('transacciones');
  });

  it('la reversión borra las importaciones de retiradas, quita las columnas y se puede reaplicar', async () => {
    await pool.query(down);
    expect(await columnas()).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM csv_imports`)).rows[0].n).toBe(1);
    await pool.query(up);
    expect(await columnas()).toBe(3);
  });
});
