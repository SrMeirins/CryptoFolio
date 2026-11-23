import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 029 (#519): alertas de precio y de cartera. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/029_alertas.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/029_alertas.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;

const tabla = async () => (await pool.query(`SELECT to_regclass('alertas') AS t`)).rows[0].t;
const precio = (activo: string, valor: number | null, sentido: string | null = 'por_encima') => pool.query(
  `INSERT INTO alertas (tipo, activo, sentido, precio) VALUES ('precio', $1, $2, $3)`, [activo, sentido, valor]);
const cartera = (pct: number) => pool.query(`INSERT INTO alertas (tipo, umbral_pct) VALUES ('cartera', $1)`, [pct]);

describe('migración 029_alertas', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    await pool.query(`INSERT INTO asset_metadata (symbol, name, price_source) VALUES ('ZZTEST', 'Sintético', 'unknown') ON CONFLICT DO NOTHING`);
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y valida precio positivo, activo existente y campos por tipo', async () => {
    await pool.query(up);
    await pool.query(up);
    expect(await tabla()).toBe('alertas');
    await precio('ZZTEST', 1.5);
    await expect(precio('ZZTEST', 0)).rejects.toThrow();
    await expect(precio('NOEXISTE', 1)).rejects.toThrow();
    await expect(precio('ZZTEST', 1, null)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO alertas (tipo, activo, sentido, precio, umbral_pct) VALUES ('precio', 'ZZTEST', 'por_debajo', 1, 5)`)).rejects.toThrow();
  });

  it('una sola alerta de cartera, con umbral positivo', async () => {
    await cartera(5);
    await expect(cartera(10)).rejects.toThrow();
    await pool.query(`DELETE FROM alertas WHERE tipo = 'cartera'`);
    await expect(cartera(0)).rejects.toThrow();
  });

  it('borrar el activo borra sus alertas', async () => {
    await pool.query(`DELETE FROM asset_metadata WHERE symbol = 'ZZTEST'`);
    expect((await pool.query(`SELECT count(*)::int AS n FROM alertas WHERE tipo = 'precio'`)).rows[0].n).toBe(0);
  });

  it('la reversión quita la tabla y se puede volver a aplicar', async () => {
    await pool.query(down);
    expect(await tabla()).toBeNull();
    await pool.query(up);
    expect(await tabla()).toBe('alertas');
  });
});
