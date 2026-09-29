import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Comprueba que POST /api/transactions/manual y PUT /api/transactions/:id
// validan la entrada con Zod: un valor numérico inválido debe rechazarse con
// 400, nunca convertirse silenciosamente a 0 (bug real detectado en auditoría
// — antes `parseFloat(x ?? '0') || 0` aceptaba cualquier basura como monto 0).

// transactions.ts resuelve el precio histórico contra la API pública de
// Binance (no CoinGecko) sin mockear — en un runner de CI compartido esa
// llamada de red real puede ser lenta o toparse con rate limit, superando
// el timeout por defecto del test (5s). Este test es sobre validación Zod,
// no sobre precisión de precio, así que se mockea (mismo patrón que
// fifo/engine.test.ts) — encontrado al verificar el ci.yml nuevo contra el
// runner real de GitHub Actions (pasaba siempre en local).
vi.mock('../modules/prices/binance', () => ({
  getHistoricalPriceEur: vi.fn(() => Promise.resolve(100)),
}));
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;
let secondWalletId: string;
let existingTxId: string;

describe('routes/transactions — validación Zod', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(
      `INSERT INTO wallets (name, type) VALUES ('Wallet Zod test', 'hardware') RETURNING id`
    );
    walletId = wallet.rows[0].id;

    const wallet2 = await pool.query(
      `INSERT INTO wallets (name, type) VALUES ('Wallet Zod test 2', 'hardware') RETURNING id`
    );
    secondWalletId = wallet2.rows[0].id;

    const tx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, manually_added)
       VALUES ('BUY', NOW(), 'BTC', 1, 1, $1, true) RETURNING id`,
      [walletId]
    );
    existingTxId = tx.rows[0].id;

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('POST /manual rechaza con 400 un amount no numérico (antes se convertía silenciosamente a 0)', async () => {
    const res = await request(app)
      .post('/api/transactions/manual')
      .send({
        operationType: 'BUY',
        asset: 'BTC',
        amount: 'no-es-un-numero',
        amountNet: 'no-es-un-numero',
        costAsset: 'EUR',
        costAmount: 100,
        pricePerUnit: 100,
        wallet_id: walletId,
        timestamp: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(res.body.error).not.toMatch(/^Error:/); // sin fuga de stack/mensaje interno

    // Verificamos también que NO se ha insertado ninguna transacción con amount 0
    const rows = await pool.query(
      `SELECT * FROM transactions WHERE asset = 'BTC' AND amount = 0 AND manually_added = true`
    );
    expect(rows.rows.length).toBe(0);
  });

  it('POST /manual acepta una petición válida y se comporta igual que antes (201/200 + fifo)', async () => {
    const res = await request(app)
      .post('/api/transactions/manual')
      .send({
        operationType: 'BUY',
        asset: 'ETH',
        amount: 2,
        amountNet: 2,
        costAsset: 'EUR',
        costAmount: 200,
        pricePerUnit: 100,
        wallet_id: walletId,
        timestamp: new Date().toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PUT /:id rechaza con 400 un costAmount no numérico', async () => {
    const res = await request(app)
      .put(`/api/transactions/${existingTxId}`)
      .send({
        operationType: 'BUY',
        asset: 'BTC',
        amount: 1,
        amountNet: 1,
        costAsset: 'EUR',
        costAmount: 'gratis',
        wallet_id: walletId,
        timestamp: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('PUT /:id acepta una petición válida y se comporta igual que antes', async () => {
    const res = await request(app)
      .put(`/api/transactions/${existingTxId}`)
      .send({
        operationType: 'BUY',
        asset: 'BTC',
        amount: 1.5,
        amountNet: 1.5,
        costAsset: 'EUR',
        costAmount: 150,
        pricePerUnit: 100,
        wallet_id: secondWalletId,
        timestamp: new Date().toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /manual sigue rechazando con 400 cuando falta operationType (comportamiento previo)', async () => {
    const res = await request(app)
      .post('/api/transactions/manual')
      .send({ timestamp: new Date().toISOString() });

    expect(res.status).toBe(400);
  });
});
