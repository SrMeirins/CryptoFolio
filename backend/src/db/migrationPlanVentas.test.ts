import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 027 (#546): plan de ventas de fin de año.
const up = readFileSync(path.join(__dirname, 'migrations/027_plan_ventas.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/027_plan_ventas.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
let w: string;

const tabla = async () => (await pool.query(`SELECT to_regclass('plan_ventas') AS t`)).rows[0].t;
const venta = (orden: number, asset = 'AAA', cantidad = 1, precio: number | null = null) => pool.query(
  'INSERT INTO plan_ventas (ejercicio, orden, asset, wallet_id, cantidad, precio_eur) VALUES (2026, $1, $2, $3, $4, $5)', [orden, asset, w, cantidad, precio]);

describe('migración 027_plan_ventas', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    w = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Sintética', 'exchange') RETURNING id`)).rows[0].id;
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y valida cantidad, precio, símbolo y orden único', async () => {
    await pool.query(up);
    await pool.query(up);
    expect(await tabla()).toBe('plan_ventas');
    await venta(0);
    await expect(venta(0)).rejects.toThrow();
    await expect(venta(1, 'AAA', 0)).rejects.toThrow();
    await expect(venta(1, 'AAA', 1, 0)).rejects.toThrow();
    await expect(venta(1, 'aaa')).rejects.toThrow();
  });

  it('borrar la wallet borra sus ventas del plan', async () => {
    await pool.query('DELETE FROM wallets WHERE id = $1', [w]);
    expect((await pool.query('SELECT count(*)::int AS n FROM plan_ventas')).rows[0].n).toBe(0);
  });

  it('la reversión quita la tabla y se puede volver a aplicar', async () => {
    await pool.query(down);
    expect(await tabla()).toBeNull();
    await pool.query(up);
    expect(await tabla()).toBe('plan_ventas');
  });
});
