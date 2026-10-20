import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// POST /api/wallets/link-address (#320): guardar la dirección de un retiro en una
// wallet propia desde la importación. Datos sintéticos.
const EVM = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';

describe('POST /api/wallets/link-address', () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let app: import('express').Express;
  let ethId: string;
  let xrpId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    ethId = (await pool.query(`SELECT id FROM networks WHERE name = 'Ethereum'`)).rows[0].id;
    xrpId = (await pool.query(`SELECT id FROM networks WHERE name = 'XRP Ledger'`)).rows[0].id;
    app = (await import('../app')).default;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  const post = (body: object) => request(app).post('/api/wallets/link-address').send(body);

  it('primera vez: crea la wallet y le añade la dirección en una sola operación', async () => {
    const r = await post({ newWallet: { name: 'Ledger sintética', type: 'hardware', color: '#112233', notes: 'Nano' }, network_id: xrpId, address: 'rSintetica1234' });
    expect(r.status).toBe(201);
    expect(r.body.wallet).toMatchObject({ name: 'Ledger sintética', color: '#112233' });
    const filas = await pool.query(`SELECT network_id, address FROM wallet_addresses WHERE wallet_id = $1`, [r.body.wallet.id]);
    expect(filas.rows).toEqual([{ network_id: xrpId, address: 'rSintetica1234' }]);
  });

  it('añade otra red a una wallet existente', async () => {
    const w = (await pool.query(`SELECT id FROM wallets WHERE name = 'Ledger sintética'`)).rows[0].id;
    const r = await post({ walletId: w, network_id: ethId, address: EVM });
    expect(r.status).toBe(201);
    expect((await pool.query(`SELECT count(*)::int AS n FROM wallet_addresses WHERE wallet_id = $1`, [w])).rows[0].n).toBe(2);
  });

  it('una dirección ya guardada (EVM sin distinguir mayúsculas) devuelve 409 y no crea la wallet nueva', async () => {
    const r = await post({ newWallet: { name: 'Otra sintética', type: 'software', color: '#445566' }, network_id: ethId, address: EVM.toLowerCase() });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Ledger sintética/);
    expect((await pool.query(`SELECT count(*)::int AS n FROM wallets WHERE name = 'Otra sintética'`)).rows[0].n).toBe(0);
  });

  it('no permite guardar en un exchange ni en una wallet del sistema', async () => {
    const sys = (await pool.query(`SELECT id FROM wallets WHERE is_system = TRUE LIMIT 1`)).rows[0].id;
    expect((await post({ walletId: sys, network_id: xrpId, address: 'rOtraSintetica99' })).status).toBe(404);
  });

  it('nombre repetido → 409; validación estricta → 400', async () => {
    expect((await post({ newWallet: { name: 'Ledger sintética', type: 'hardware', color: '#112233' }, network_id: null, address: 'rNueva12345' })).status).toBe(409);
    expect((await post({ network_id: null, address: 'rNueva12345' })).status).toBe(400);
    expect((await post({ walletId: '00000000-0000-0000-0000-000000000000', newWallet: { name: 'x', type: 'hardware', color: '#112233' }, network_id: null, address: 'rNueva12345' })).status).toBe(400);
    expect((await post({ newWallet: { name: 'x', type: 'exchange', color: '#112233' }, network_id: null, address: 'rNueva12345' })).status).toBe(400);
    expect((await post({ newWallet: { name: 'x', type: 'hardware', color: 'red;' }, network_id: null, address: 'rNueva12345' })).status).toBe(400);
    const xss = await post({ newWallet: { name: 'x', type: 'hardware', color: '#112233' }, network_id: null, address: '<script>alert(1)</script>' });
    expect(xss.status).toBe(400);
    expect(JSON.stringify(xss.body)).not.toContain('<script>');
  });
});
