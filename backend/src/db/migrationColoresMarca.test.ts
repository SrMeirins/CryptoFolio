import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 028 (#525): un color de marca por exchange en las wallets nativas.
const up = readFileSync(path.join(__dirname, 'migrations/028_colores_marca.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/028_colores_marca.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const colores = async () => Object.fromEntries((await pool.query(`SELECT name, color FROM wallets WHERE is_system AND type = 'exchange'`)).rows.map(r => [r.name, r.color]));

describe('migración 028_colores_marca', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('todas las subcuentas de Binance con su amarillo y Bitvavo con su azul; idempotente', async () => {
    await pool.query(down);
    expect(new Set(Object.entries(await colores()).filter(([n]) => n.startsWith('Binance ')).map(([, c]) => c)).size).toBeGreaterThan(1);
    await pool.query(up);
    await pool.query(up);
    const c = await colores();
    for (const [nombre, color] of Object.entries(c)) expect(color).toBe(nombre.startsWith('Binance ') ? '#F0B90B' : '#273A75');
  });

  it('no toca las wallets del usuario', async () => {
    const w = (await pool.query(`INSERT INTO wallets (name, type, color) VALUES ('Binance mía', 'exchange', '#123456') RETURNING id`)).rows[0].id;
    await pool.query(up);
    expect((await pool.query('SELECT color FROM wallets WHERE id = $1', [w])).rows[0].color).toBe('#123456');
  });
});
