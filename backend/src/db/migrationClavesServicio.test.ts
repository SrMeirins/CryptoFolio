import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 030 (versión 1.0): clave de CoinGecko cifrada. La base de test se
// crea desde schema.sql, que ya incluye la tabla. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/030_claves_servicio.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/030_claves_servicio.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const existe = async () => (await pool.query(`SELECT to_regclass('claves_servicio') AS t`)).rows[0].t !== null;
const insertar = (servicio: string, plan = 'demo') =>
  pool.query(`INSERT INTO claves_servicio (servicio, api_key_encrypted, api_key_iv, plan) VALUES ($1, '\\x00', '\\x00', $2)`, [servicio, plan]);

describe('migración 030_claves_servicio', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente y solo admite servicios y planes conocidos', async () => {
    await pool.query(up);
    await insertar('coingecko', 'pro');
    await expect(insertar('kraken')).rejects.toThrow();
    await pool.query(`DELETE FROM claves_servicio`);
    await expect(insertar('coingecko', 'gratis')).rejects.toThrow();
  });

  it('la reversión elimina la tabla y volver a aplicarla la recrea vacía', async () => {
    await pool.query(down);
    expect(await existe()).toBe(false);
    await pool.query(up);
    expect((await pool.query(`SELECT count(*)::int AS n FROM claves_servicio`)).rows[0].n).toBe(0);
  });
});
