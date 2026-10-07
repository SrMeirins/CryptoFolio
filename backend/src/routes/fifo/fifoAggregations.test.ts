import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Ninguno de los 6 endpoints de agregación tenía test propio. Se ejecuta el
// motor FIFO real (sin red, no hace falta mockear nada) sobre datos
// sembrados directamente para poblar fifo_lots/fifo_lot_consumptions —
// mismo patrón que modules/fifo/engine.test.ts.
//
// runFifoEngine/el router se importan dinámicamente DENTRO de beforeAll,
// después de fijar DATABASE_URL — nunca como import estático de este
// fichero. db/client.ts lee DATABASE_URL una sola vez al cargarse (crea el
// Pool ahí mismo) y queda cacheado para el resto del proceso; un import
// estático aquí se evalúa durante la fase de recolección de vitest, ANTES
// de que este beforeAll fije DATABASE_URL al valor de test — confirmado
// empíricamente: con el import estático, este test leía y escribía en la
// base de datos real de desarrollo en vez de en la aislada (mismo patrón
// ya documentado en modules/fifo/engine.test.ts).
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

describe('routes/fifo — endpoints de agregación', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet agregaciones test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
       VALUES ('BUY', '2024-01-01T00:00:00Z', 'BTC', 1, 1, 'EUR', 100, $1)`,
      [walletId]
    );
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
       VALUES ('SELL', '2024-02-01T00:00:00Z', 'BTC', 0.4, 0.4, 'EUR', 60, $1)`,
      [walletId]
    );
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('DEPOSIT_FIAT', '2023-12-01T00:00:00Z', 'EUR', 200, 200, $1)`,
      [walletId]
    );

    const { runFifoEngine } = await import('../../modules/fifo/engine');
    await runFifoEngine();

    const { default: router } = await import('./fifoAggregations');
    app = express();
    app.use('/api/fifo', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('GET /summary agrega la ganancia/pérdida realizada por año fiscal', async () => {
    const res = await request(app).get('/api/fifo/summary');
    expect(res.status).toBe(200);
    const year2024 = res.body.find((r: { fiscal_year: number }) => r.fiscal_year === 2024);
    expect(year2024).toBeTruthy();
    expect(Number(year2024.total_gains_eur)).toBeGreaterThan(0);
  });

  it('GET /fiat-balances devuelve el saldo EUR neto de la wallet representante', async () => {
    const res = await request(app).get('/api/fifo/fiat-balances');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /eur-flow calcula depositado/gastado/recibido correctamente', async () => {
    const res = await request(app).get('/api/fifo/eur-flow');
    expect(res.status).toBe(200);
    expect(res.body.deposited).toBe(200);
    expect(res.body.eurSpentBuying).toBe(100);
    expect(res.body.eurReceivedSelling).toBe(60);
    expect(res.body.netInvested).toBe(40);
  });

  it('GET /realized-pnl agrega la ganancia realizada de BTC (compra 100€ por 1, venta 60€ por 0.4 = coste 40€, ganancia 20€)', async () => {
    const res = await request(app).get('/api/fifo/realized-pnl');
    expect(res.status).toBe(200);
    const btc = res.body.byAsset.find((r: { asset: string }) => r.asset === 'BTC');
    expect(btc).toBeTruthy();
    expect(Number(btc.net_pnl)).toBeCloseTo(20, 2);
  });

  it('GET /lots devuelve el lote restante (0.6 BTC) tras la venta parcial', async () => {
    const res = await request(app).get('/api/fifo/lots');
    expect(res.status).toBe(200);
    const btc = res.body.find((r: { asset: string }) => r.asset === 'BTC');
    expect(btc).toBeTruthy();
    expect(Number(btc.quantity)).toBeCloseTo(0.6, 6);
  });

  it('GET /locked devuelve vacío cuando no hay operaciones de staking/launchpool', async () => {
    const res = await request(app).get('/api/fifo/locked');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
