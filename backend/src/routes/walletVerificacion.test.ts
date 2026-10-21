import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Verificación automática de direcciones (#336): se lanza al guardar, la API de
// wallets trae el diagnóstico y la campana avisa con el paso a seguir. La
// verificación real (red) se sustituye por un espía. Datos sintéticos.
const { verificar } = vi.hoisted(() => ({ verificar: vi.fn() }));
vi.mock('../modules/walletSync/walletSync', async (orig) => ({
  ...(await orig<typeof import('../modules/walletSync/walletSync')>()),
  verificarEnSegundoPlano: verificar,
}));

describe('verificación automática de direcciones (#336)', () => {
  let testDb: TestDatabase;
  let pool: Pool;
  let app: import('express').Express;
  let xrp: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    xrp = (await pool.query(`SELECT id FROM networks WHERE name = 'XRP Ledger'`)).rows[0].id;
    app = (await import('../app')).default;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('guardar una dirección (desde la importación o desde Ajustes) lanza su verificación', async () => {
    const r = await request(app).post('/api/wallets/link-address')
      .send({ newWallet: { name: 'Ledger verificación', type: 'hardware', color: '#112233' }, network_id: xrp, address: 'rSinteticaVerif1' });
    expect(r.status).toBe(201);
    expect(verificar).toHaveBeenCalledWith(r.body.addressId);

    const a = await request(app).post(`/api/wallets/${r.body.wallet.id}/addresses`).send({ network_id: xrp, address: 'rSinteticaVerif2' });
    expect(a.status).toBe(201);
    expect(verificar).toHaveBeenCalledWith(a.body.id);
  });

  it('la API de wallets incluye el diagnóstico y la campana avisa con el paso a seguir', async () => {
    const dir = (await pool.query(`SELECT id FROM wallet_addresses WHERE address = 'rSinteticaVerif1'`)).rows[0].id;
    await pool.query(
      `INSERT INTO balance_sync_log (wallet_address_id, asset, onchain_balance, expected_balance, discrepancy_pct, status, error)
       VALUES ($1, 'XRP', 10.2, 10, 0.02, 'discrepancy', NULL), ($1, 'SOLO', NULL, 3, NULL, 'error', 'falta API key para XRP Ledger')`,
      [dir],
    );

    const wallets = (await request(app).get('/api/wallets')).body as Array<{ name: string; addresses: Array<{ address: string; sync_details: Array<{ asset: string; diagnostico: { tipo: string } }> }> }>;
    const detalles = wallets.find(w => w.name === 'Ledger verificación')!.addresses.find(x => x.address === 'rSinteticaVerif1')!.sync_details;
    expect(Object.fromEntries(detalles.map(d => [d.asset, d.diagnostico.tipo]))).toEqual({ XRP: 'discrepancia', SOLO: 'api_key' });

    const avisos = (await request(app).get('/api/settings/notifications')).body as Array<{ id: string; message: string }>;
    expect(avisos.find(n => n.id === 'wallet-discrepancia')?.message).toContain('Ledger verificación · XRP: en la cadena hay 10,2 y la app espera 10.');
    expect(avisos.find(n => n.id === 'wallet-verificacion')?.message).toContain('Añádela en Ajustes › Wallets');
  });
});
