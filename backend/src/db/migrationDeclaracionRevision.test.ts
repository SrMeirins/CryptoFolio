import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 021 (#542): el tipo «revision» en fiscal_declaraciones. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/021_declaracion_revision.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/021_declaracion_revision.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const insertar = (tipo: string) => pool.query(`INSERT INTO fiscal_declaraciones (ejercicio, tipo, cifras) VALUES (2024, $1, '{}')`, [tipo]);

describe('migración 021_declaracion_revision', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('el esquema ya admite «revision» y la migración es idempotente', async () => {
    await pool.query(up);
    await pool.query(up);
    await insertar('revision');
    await expect(insertar('otro')).rejects.toThrow(/fiscal_declaraciones_tipo_check/);
  });

  it('la reversión borra las revisiones y vuelve a admitir solo Renta y 721', async () => {
    await insertar('renta');
    await pool.query(down);
    const tipos = (await pool.query(`SELECT tipo FROM fiscal_declaraciones ORDER BY tipo`)).rows.map((r: { tipo: string }) => r.tipo);
    expect(tipos).toEqual(['renta']);
    await expect(insertar('revision')).rejects.toThrow(/fiscal_declaraciones_tipo_check/);
    await pool.query(up);
  });
});
