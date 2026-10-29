import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Edición de transacciones importadas (#378): copia del original en la primera
// edición, notas que no cuentan, vuelta al original, restauración, filtro y
// validación del PUT. Datos sintéticos; precios simulados (sin red).
vi.mock('../../modules/prices/binance', () => ({ getHistoricalPriceEur: vi.fn(() => Promise.resolve(100)) }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;
let otherWalletId: string;
let importedId: string;
let manualId: string;

// Compra importada con la comisión descontada del propio activo: neto < bruto.
const ORIGINAL = { amount: '10', amount_net: '9.9', price_per_unit: '2', cost_amount: '20' };
const body = (over: Record<string, unknown> = {}) => ({
  operationType: 'BUY', asset: 'XRP', amount: 10, amountNet: 9.9, costAsset: 'EUR', costAmount: 20, pricePerUnit: 2,
  feeAsset: 'XRP', feeAmount: 0.1, wallet_id: walletId, timestamp: '2025-03-01T10:00:00.000Z', notes: null, ...over,
});
const original = async (id: string) =>
  (await pool.query('SELECT original_import, amount, amount_net, notes, wallet_id FROM transactions WHERE id = $1', [id])).rows[0];

describe('edición de importadas (#378)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = (await import('../../db/client')).pool;
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Exchange sintético', 'exchange') RETURNING id`)).rows[0].id;
    otherWalletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Fría sintética', 'hardware') RETURNING id`)).rows[0].id;

    const { default: write } = await import('./transactionsWrite');
    const { default: list } = await import('./transactionsList');
    const { default: restore } = await import('./transactionRestore');
    app = express();
    app.use(express.json());
    app.use('/api/transactions', write);
    app.use('/api/transactions', list);
    app.use('/api/v1/transactions', restore);
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM fifo_lot_consumptions');
    await pool.query('DELETE FROM fifo_lots');
    await pool.query('DELETE FROM transactions');
    importedId = (await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, price_per_unit,
         fee_asset, fee_amount, wallet_id, manually_added)
       VALUES ('BUY', '2025-03-01T10:00:00Z', 'XRP', $1, $2, 'EUR', $4, $3, 'XRP', 0.1, $5, FALSE) RETURNING id`,
      [ORIGINAL.amount, ORIGINAL.amount_net, ORIGINAL.price_per_unit, ORIGINAL.cost_amount, walletId])).rows[0].id;
    manualId = (await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, manually_added)
       VALUES ('DEPOSIT_CRYPTO', '2025-03-02T10:00:00Z', 'XRP', 5, 5, $1, TRUE) RETURNING id`, [walletId])).rows[0].id;
  });

  it('la primera edición guarda el original; las siguientes lo conservan', async () => {
    expect((await request(app).put(`/api/transactions/${importedId}`).send(body({ amount: 12, amountNet: 11.9 }))).status).toBe(200);
    const first = await original(importedId);
    expect(Number(first.amount)).toBe(12);
    expect(first.original_import).toMatchObject({ operation_type: 'BUY', asset: 'XRP', wallet_id: walletId });
    expect(Number(first.original_import.amount)).toBe(10);
    expect(Number(first.original_import.amount_net)).toBe(9.9);

    await request(app).put(`/api/transactions/${importedId}`).send(body({ amount: 15, amountNet: 14.9, wallet_id: otherWalletId }));
    const second = await original(importedId);
    expect(Number(second.original_import.amount)).toBe(10);
    expect(second.original_import.wallet_id).toBe(walletId);
  });

  it('cambiar solo las notas no la marca como editada', async () => {
    await request(app).put(`/api/transactions/${importedId}`).send(body({ notes: 'revisada' }));
    const r = await original(importedId);
    expect(r.notes).toBe('revisada');
    expect(r.original_import).toBeNull();
  });

  it('volver a los valores importados la desmarca', async () => {
    await request(app).put(`/api/transactions/${importedId}`).send(body({ amount: 12, amountNet: 11.9 }));
    expect((await original(importedId)).original_import).not.toBeNull();
    await request(app).put(`/api/transactions/${importedId}`).send(body());
    expect((await original(importedId)).original_import).toBeNull();
  });

  it('una manual se edita sin guardar original', async () => {
    const res = await request(app).put(`/api/transactions/${manualId}`).send(body({ operationType: 'DEPOSIT_CRYPTO', amount: 7, amountNet: 7, costAsset: null, costAmount: null, pricePerUnit: 1, feeAsset: null, feeAmount: null }));
    expect(res.status).toBe(200);
    expect((await original(manualId)).original_import).toBeNull();
  });

  it('restaurar repone los valores importados, quita la marca y recalcula el FIFO', async () => {
    await request(app).put(`/api/transactions/${importedId}`).send(body({ amount: 12, amountNet: 11.9, wallet_id: otherWalletId, notes: 'cambio' }));
    const res = await request(app).post(`/api/v1/transactions/${importedId}/restaurar`);
    expect(res.status).toBe(200);
    expect(res.body.fifo).toBeTruthy();
    const r = await original(importedId);
    expect(r.original_import).toBeNull();
    expect(Number(r.amount)).toBe(10);
    expect(Number(r.amount_net)).toBe(9.9);
    expect(r.wallet_id).toBe(walletId);
    expect(r.notes).toBe('cambio'); // las notas no se restauran
    const lot = (await pool.query('SELECT quantity_original FROM fifo_lots WHERE open_transaction_id = $1', [importedId])).rows[0];
    expect(Number(lot.quantity_original)).toBe(9.9);
  });

  it('restaurar: 409 si no está editada, 404 si no existe, 400 con un id inválido', async () => {
    expect((await request(app).post(`/api/v1/transactions/${importedId}/restaurar`)).status).toBe(409);
    expect((await request(app).post(`/api/v1/transactions/${manualId}/restaurar`)).status).toBe(409);
    expect((await request(app).post('/api/v1/transactions/00000000-0000-0000-0000-000000000000/restaurar')).status).toBe(404);
    const bad = await request(app).post("/api/v1/transactions/x' OR 1=1/restaurar");
    expect(bad.status).toBe(400);
    expect(bad.body.error).not.toMatch(/syntax|postgres|invalid input/i);
  });

  it('el filtro «edited» y la columna original_import en el listado', async () => {
    await request(app).put(`/api/transactions/${importedId}`).send(body({ amount: 12, amountNet: 11.9 }));
    const editadas = (await request(app).get('/api/transactions?edited=true')).body;
    expect(editadas.total).toBe(1);
    expect(editadas.transactions[0].id).toBe(importedId);
    expect(editadas.transactions[0].original_import).not.toBeNull();
    expect((await request(app).get('/api/transactions?edited=false')).body.total).toBe(1);
    expect((await request(app).get('/api/transactions?edited=si')).status).toBe(400);
  });

  it.each([
    ['tipo de operación inexistente', { operationType: 'ROBO' }, 'operationType'],
    ['wallet que no es UUID', { wallet_id: "1' OR '1'='1" }, 'wallet_id'],
    ['destino que no es UUID', { destinationWalletId: 'abc' }, 'destinationWalletId'],
  ])('PUT con %s → 400 legible', async (_c, over, campo) => {
    const res = await request(app).put(`/api/transactions/${importedId}`).send(body(over));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(campo);
    expect((await original(importedId)).original_import).toBeNull();
  });

  it('PUT con un id inválido → 400; inexistente → 404', async () => {
    expect((await request(app).put('/api/transactions/abc').send(body())).status).toBe(400);
    expect((await request(app).put('/api/transactions/00000000-0000-0000-0000-000000000000').send(body())).status).toBe(404);
  });

  it('un destino vacío del formulario equivale a sin destino', async () => {
    expect((await request(app).put(`/api/transactions/${importedId}`).send(body({ destinationWalletId: '' }))).status).toBe(200);
  });
});
