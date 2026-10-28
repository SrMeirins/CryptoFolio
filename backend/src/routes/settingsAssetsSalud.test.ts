import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Activos en Ajustes (#450): uso de cada activo, último fallo de precio y
// reintento limitado. Sin red: los proveedores fallan al instante. Datos sintéticos.
beforeAll(() => { vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true'); });
afterAll(() => { vi.unstubAllEnvs(); });

describe('activos: uso, último fallo y reintento (#450)', () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let app: import('express').Express;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    await pool.query(`INSERT INTO asset_metadata (symbol, name, is_stablecoin, price_source) VALUES ('SINTU', 'Sintético', FALSE, 'coingecko')`);
    const w = (await pool.query(`SELECT id FROM wallets LIMIT 1`)).rows[0].id;
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id) VALUES
       ('BUY', now(), 'SINTU', 1, 1, $1), ('SELL', now(), 'SINTU', 1, 1, $1)`, [w]);
    app = (await import('../app')).default;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  const asset = async (symbol: string) =>
    ((await request(app).get('/api/settings/assets')).body as Array<{ symbol: string; operaciones: number; ultimo_fallo: unknown }>).find(a => a.symbol === symbol)!;

  it('cada activo trae su número de operaciones', async () => {
    expect((await asset('SINTU')).operaciones).toBe(2);
    expect((await asset('ETH')).operaciones).toBe(0);
  });

  it('el reintento registra el fallo de un activo sin precio y no se repite antes de un minuto', async () => {
    const first = await request(app).post('/api/settings/assets/retry-prices');
    expect(first.status).toBe(200);
    expect((await asset('SINTU')).ultimo_fallo).toMatchObject({ source: 'coingecko', reason: 'sin-precio' });
    const second = await request(app).post('/api/settings/assets/retry-prices');
    expect(second.status).toBe(429);
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);
  });
});
