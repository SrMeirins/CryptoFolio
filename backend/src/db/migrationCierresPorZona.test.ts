import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 015 (#389): cierres diarios por zona horaria. La base de test se
// crea desde schema.sql, que ya tiene price_close_daily. Datos sintéticos.
const up = readFileSync(path.join(__dirname, 'migrations/015_cierres_por_zona.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/015_cierres_por_zona.sql'), 'utf8');
const m001 = readFileSync(path.join(__dirname, 'migrations/001_price_close_madrid.sql'), 'utf8');
const m012 = readFileSync(path.join(__dirname, 'migrations/012_fuentes_respaldo.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
const tables = async () => (await pool.query(
  `SELECT to_regclass('price_close_madrid')::text AS vieja, to_regclass('price_close_daily')::text AS nueva`)).rows[0];
const rows = async () => (await pool.query(
  `SELECT asset, timezone, close_date::text AS day, price_eur::float AS price, source FROM price_close_daily ORDER BY asset, timezone, close_date`)).rows;

describe('migración 015_cierres_por_zona', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('base desplegada: transforma price_close_madrid y conserva sus filas como Europe/Madrid', async () => {
    await pool.query(down);
    expect(await tables()).toEqual({ vieja: 'price_close_madrid', nueva: null });
    await pool.query(`INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES
      ('XRP', '2026-01-15', 2.5, 'binance_1h'), ('RARO', '2026-01-15', -1, 'none')`);
    await pool.query(up);
    expect(await tables()).toEqual({ vieja: null, nueva: 'price_close_daily' });
    expect(await rows()).toEqual([
      { asset: 'RARO', timezone: 'Europe/Madrid', day: '2026-01-15', price: -1, source: 'none' },
      { asset: 'XRP', timezone: 'Europe/Madrid', day: '2026-01-15', price: 2.5, source: 'binance_1h' },
    ]);
  });

  it('admite el mismo día en otra zona y mantiene las restricciones', async () => {
    await pool.query(`INSERT INTO price_close_daily (asset, timezone, close_date, price_eur, source) VALUES ('XRP', 'Atlantic/Canary', '2026-01-15', 2.6, 'binance_1h')`);
    await expect(pool.query(`INSERT INTO price_close_daily (asset, timezone, close_date, price_eur, source) VALUES ('XRP', 'Atlantic/Canary', '2026-01-15', 2.7, 'binance_1h')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO price_close_daily (asset, timezone, close_date, price_eur, source) VALUES ('BAD', 'Europe/Madrid', '2026-01-15', 0, 'binance_1h')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO price_close_daily (asset, timezone, close_date, price_eur, source) VALUES ('BAD', '', '2026-01-15', 1, 'binance_1h')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO price_close_daily (asset, close_date, price_eur, source) VALUES ('BAD', '2026-01-15', 1, 'binance_1h')`)).rejects.toThrow();
  });

  it('ya migrada: no hace nada', async () => {
    const before = await rows();
    await pool.query(up);
    expect(await rows()).toEqual(before);
  });

  it('instalación nueva: la 001 recrea una tabla vieja vacía y la 015 la retira', async () => {
    await pool.query(m001);
    await pool.query(m012);
    expect(await tables()).toEqual({ vieja: 'price_close_madrid', nueva: 'price_close_daily' });
    await pool.query(`INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES ('ADA', '2026-01-15', 0.3, 'okx_1d')`);
    await pool.query(up);
    expect(await tables()).toEqual({ vieja: null, nueva: 'price_close_daily' });
    expect((await rows()).find(r => r.asset === 'ADA')).toEqual({ asset: 'ADA', timezone: 'Europe/Madrid', day: '2026-01-15', price: 0.3, source: 'okx_1d' });
  });

  it('la reversión vuelve a price_close_madrid con los cierres de Madrid; reaplicar la recrea', async () => {
    await pool.query(down);
    expect(await tables()).toEqual({ vieja: 'price_close_madrid', nueva: null });
    const old = (await pool.query(`SELECT asset FROM price_close_madrid ORDER BY asset`)).rows.map(r => r.asset);
    expect(old).toEqual(['ADA', 'RARO', 'XRP']); // el de Canarias se descarta
    await pool.query(up);
    expect((await rows()).every(r => r.timezone === 'Europe/Madrid')).toBe(true);
  });
});
