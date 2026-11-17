import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Conversión de restos (#530). Datos sintéticos. getHistoricalPriceEur se
// mockea (100 € por unidad) para no depender de red; el router se importa
// después de fijar DATABASE_URL.
const { getHistoricalPriceEurMock } = vi.hoisted(() => ({
  getHistoricalPriceEurMock: vi.fn(() => Promise.resolve(100)),
}));
vi.mock('../../modules/prices/binance', () => ({
  getHistoricalPriceEur: getHistoricalPriceEurMock,
}));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;
let otraWallet: string;

async function compra(wallet: string, asset: string, qty: number, eur: number, at: string) {
  await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, price_per_unit, wallet_id)
     VALUES ('BUY', $1, $2, $3, $3, 'EUR', $4, $5, $6)`, [at, asset, qty, eur, eur / qty, wallet],
  );
}

const lotesAbiertos = async (asset: string, wallet: string) =>
  parseFloat((await pool.query(`SELECT COALESCE(SUM(quantity_remaining), 0) AS q FROM fifo_lots WHERE asset = $1 AND wallet_id = $2 AND is_closed = FALSE`, [asset, wallet])).rows[0].q);

describe('POST /api/v1/transactions/conversion-restos (#530)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet restos', 'exchange') RETURNING id`)).rows[0].id;
    otraWallet = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet otra', 'exchange') RETURNING id`)).rows[0].id;
    await compra(walletId, 'SINTA', 0.5, 0.2, '2024-01-01T10:00:00Z');
    await compra(walletId, 'SINTB', 0.01, 0.05, '2024-02-01T10:00:00Z');
    await compra(otraWallet, 'SINTA', 3, 1.2, '2024-03-01T10:00:00Z');
    const { runFifoEngine } = await import('../../modules/fifo/engine');
    await runFifoEngine();
    const { default: router } = await import('./conversionRestos');
    app = express();
    app.use(express.json());
    app.use('/api/v1/transactions', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  const cuerpo = (over: Record<string, unknown> = {}) => ({
    walletId, timestamp: '2026-11-01T10:00:00.000Z', recibido: 'sintc',
    items: [{ asset: 'SINTA', cantidad: 0.5, recibido: 0.001 }, { asset: 'SINTB', cantidad: 0.01, recibido: 0.0005 }],
    ...over,
  });

  it('vista previa: valor de lo recibido a la fecha y coste FIFO de cada resto, sin escribir nada', async () => {
    const antes = (await pool.query(`SELECT COUNT(*)::int AS n FROM transactions`)).rows[0].n;
    const res = await request(app).post('/api/v1/transactions/conversion-restos/preview').send(cuerpo());
    expect(res.status).toBe(200);
    expect(res.body.recibido).toBe('SINTC');
    expect(res.body.items[0]).toMatchObject({ asset: 'SINTA', proceedsEur: 0.1 });
    // FIFO global: el lote más antiguo de SINTA (0,40 €/ud.) cubre los 0,5.
    expect(res.body.items[0].costEur).toBeCloseTo(0.2, 9);
    expect(res.body.items[0].gainLossEur).toBeCloseTo(-0.1, 9);
    // SINTB: recibe 0,05 € y costó 0,05 €, así que el total es el de SINTA.
    expect(res.body.totalGainLossEur).toBeCloseTo(-0.1, 2);
    expect((await pool.query(`SELECT COUNT(*)::int AS n FROM transactions`)).rows[0].n).toBe(antes);
  });

  it('valida la entrada: activos repetidos, el recibido entre los restos, más de lo que hay, wallet y fecha', async () => {
    const post = (b: unknown) => request(app).post('/api/v1/transactions/conversion-restos').send(b);
    expect((await post(cuerpo({ items: [{ asset: 'SINTA', cantidad: 0.1, recibido: 1 }, { asset: 'SINTA', cantidad: 0.1, recibido: 1 }] }))).status).toBe(400);
    expect((await post(cuerpo({ recibido: 'SINTA' }))).status).toBe(400);
    const demasiado = await post(cuerpo({ items: [{ asset: 'SINTA', cantidad: 2, recibido: 1 }] }));
    expect(demasiado.status).toBe(400);
    expect(demasiado.body.error).toMatch(/^Solo hay 0\.5 SINTA/);
    expect((await post(cuerpo({ walletId: 'no-es-uuid' }))).status).toBe(400);
    expect((await post(cuerpo({ walletId: '00000000-0000-4000-8000-000000000000' }))).status).toBe(400);
    expect((await post(cuerpo({ timestamp: '2999-01-01T00:00:00.000Z' }))).status).toBe(400);
    expect((await post(cuerpo({ items: [] }))).status).toBe(400);
    expect((await post(cuerpo({ items: [{ asset: '../x', cantidad: 1, recibido: 1 }] }))).status).toBe(400);
  });

  it('registra una permuta por resto y, tras recalcular el FIFO, los restos desaparecen de la wallet', async () => {
    const res = await request(app).post('/api/v1/transactions/conversion-restos').send(cuerpo());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const txs = (await pool.query(
      `SELECT operation_type::text AS op, asset, amount::float AS amount, cost_asset, cost_amount::float AS cost_amount, manually_added, notes
       FROM transactions WHERE notes LIKE 'Conversión de restos%' ORDER BY cost_asset`)).rows;
    expect(txs).toEqual([
      { op: 'BUY', asset: 'SINTC', amount: 0.001, cost_asset: 'SINTA', cost_amount: 0.5, manually_added: true, notes: 'Conversión de restos: SINTA a SINTC' },
      { op: 'BUY', asset: 'SINTC', amount: 0.0005, cost_asset: 'SINTB', cost_amount: 0.01, manually_added: true, notes: 'Conversión de restos: SINTB a SINTC' },
    ]);
    expect(await lotesAbiertos('SINTA', walletId)).toBe(0);
    expect(await lotesAbiertos('SINTB', walletId)).toBe(0);
    expect(await lotesAbiertos('SINTC', walletId)).toBeCloseTo(0.0015, 12);
    // La otra wallet conserva su saldo (FIFO global con reubicación, #476).
    expect(await lotesAbiertos('SINTA', otraWallet)).toBeCloseTo(3, 12);
  });
});
