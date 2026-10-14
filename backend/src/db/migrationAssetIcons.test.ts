import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 004 (asset_icons, #201): idempotente, reversible y con sus
// restricciones. La base de test se crea desde schema.sql, que ya incluye la tabla.
const up = readFileSync(path.join(__dirname, 'migrations/004_asset_icons.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/004_asset_icons.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;

const tableExists = async () =>
  (await pool.query(`SELECT to_regclass('public.asset_icons') IS NOT NULL AS exists`)).rows[0].exists as boolean;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('migración 004_asset_icons', () => {
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

  it('acepta un logo válido y la marca de «sin logo»', async () => {
    await pool.query(`INSERT INTO asset_icons (symbol, status, content_type, data) VALUES ('BTC', 'ok', 'image/png', $1)`, [png]);
    await pool.query(`INSERT INTO asset_icons (symbol, status) VALUES ('RARO', 'missing')`);
    expect((await pool.query('SELECT count(*)::int AS n FROM asset_icons')).rows[0].n).toBe(2);
  });

  it('rechaza tipos no permitidos (SVG), logos sin datos, datos en «sin logo» y tamaños excesivos', async () => {
    await expect(pool.query(`INSERT INTO asset_icons (symbol, status, content_type, data) VALUES ('A', 'ok', 'image/svg+xml', $1)`, [png])).rejects.toThrow();
    await expect(pool.query(`INSERT INTO asset_icons (symbol, status, content_type) VALUES ('B', 'ok', 'image/png')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO asset_icons (symbol, status, content_type, data) VALUES ('C', 'missing', 'image/png', $1)`, [png])).rejects.toThrow();
    await expect(pool.query(`INSERT INTO asset_icons (symbol, status, content_type, data) VALUES ('D', 'ok', 'image/png', $1)`, [Buffer.alloc(262145)])).rejects.toThrow();
    await expect(pool.query(`INSERT INTO asset_icons (symbol, status) VALUES ('E', 'otro')`)).rejects.toThrow();
  });
});
