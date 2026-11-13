import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Plan de ventas (#546): guardar, leer y vaciar el plan del ejercicio en curso
// y simular su efecto con varias ventas del mismo activo en wallets distintas.
// Datos sintéticos; sin precios externos (el plan lleva los suyos).
vi.mock('../modules/prices/binance', () => ({ getHistoricalPriceEur: vi.fn(async () => 1000) }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let w1: string; let w2: string;

describe('Plan de ventas (#546)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    w1 = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Uno', 'exchange') RETURNING id`)).rows[0].id;
    w2 = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Dos', 'hardware') RETURNING id`)).rows[0].id;
    // AAA: 10 u a 100 € en Uno (2020) y 10 u a 300 € en Dos (2021).
    for (const [w, fecha, coste] of [[w1, '2020-01-10', 1000], [w2, '2021-01-10', 3000]] as const) {
      await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
         VALUES ('BUY', $1, 'AAA', 10, 10, 'EUR', $2, $3)`, [`${fecha}T10:00:00Z`, coste, w]);
    }
    app = (await import('../app')).default;
    const { runFifoEngine } = await import('../modules/fifo/engine');
    expect((await runFifoEngine()).errors).toEqual([]);
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('simula varias ventas del mismo activo en wallets distintas con el FIFO global', async () => {
    const r = await request(app).post('/api/fiscal/plan/simular').send({
      comisionPct: 0,
      ventas: [
        { asset: 'aaa', walletId: w2, cantidad: 6, precioEur: 200 },
        { asset: 'AAA', walletId: w1, cantidad: 6, precioEur: 200 },
      ],
    });
    expect(r.status).toBe(200);
    // La venta en Dos consume primero el lote antiguo de Uno (FIFO global): +600; la segunda, 4 a 100 y 2 a 300: +200.
    expect(r.body.ventas.map((v: { resultado: number }) => v.resultado)).toEqual([600, 200]);
    expect(r.body).toMatchObject({ ganancia: 800, perdida: 0, neto: 800 });
    expect(r.body.cuotaDespues).toBeGreaterThan(r.body.cuotaAntes);
  });

  it('valida el plan: cantidades positivas, máximo de ventas, comisión y campos de más', async () => {
    const venta = { asset: 'AAA', walletId: w1, cantidad: 1, precioEur: 100 };
    const simular = (body: object) => request(app).post('/api/fiscal/plan/simular').send(body);
    expect((await simular({ comisionPct: 0, ventas: [{ ...venta, cantidad: 0 }] })).status).toBe(400);
    expect((await simular({ comisionPct: 0, ventas: [] })).status).toBe(400);
    expect((await simular({ comisionPct: 0, ventas: Array(51).fill(venta) })).status).toBe(400);
    expect((await simular({ comisionPct: 11, ventas: [venta] })).status).toBe(400);
    expect((await simular({ comisionPct: 0, ventas: [{ ...venta, extra: 1 }] })).status).toBe(400);
    expect((await request(app).put('/api/fiscal/plan').send({ ventas: [{ ...venta, walletId: '00000000-0000-4000-8000-000000000000', precioEur: null }] })).status).toBe(400);
  });

  it('guarda, lee y vacía el plan del ejercicio en curso, en su orden', async () => {
    const ventas = [
      { asset: 'AAA', walletId: w2, cantidad: 2, precioEur: null },
      { asset: 'AAA', walletId: w1, cantidad: 1.5, precioEur: 250 },
    ];
    expect((await request(app).put('/api/fiscal/plan').send({ ventas })).status).toBe(200);
    const plan = (await request(app).get('/api/fiscal/plan')).body;
    expect(plan.comisionPct).toBe(0.1);
    expect(plan.ventas).toEqual([
      { asset: 'AAA', walletId: w2, walletNombre: 'Dos', cantidad: 2, precioEur: null },
      { asset: 'AAA', walletId: w1, walletNombre: 'Uno', cantidad: 1.5, precioEur: 250 },
    ]);
    expect((await request(app).delete('/api/fiscal/plan')).body.quitadas).toBe(2);
    expect((await request(app).get('/api/fiscal/plan')).body.ventas).toEqual([]);
  });

  it('la comisión estimada se cambia desde Ajustes y la usa el plan', async () => {
    expect((await request(app).put('/api/settings/config').send({ key: 'plan_comision_pct', value: '12' })).status).toBe(400);
    expect((await request(app).put('/api/settings/config').send({ key: 'plan_comision_pct', value: '0.25' })).status).toBe(200);
    expect((await request(app).get('/api/fiscal/plan')).body.comisionPct).toBe(0.25);
    await pool.query(`DELETE FROM app_config WHERE key = 'plan_comision_pct'`);
  });

  it('los planes de otros ejercicios quedan archivados y se vacían por ejercicio', async () => {
    await pool.query(`INSERT INTO plan_ventas (ejercicio, orden, asset, wallet_id, cantidad) VALUES (2020, 0, 'AAA', $1, 1)`, [w1]);
    expect((await request(app).get('/api/fiscal/plan')).body.archivados).toEqual([{ ejercicio: 2020, ventas: 1 }]);
    expect((await request(app).get('/api/fiscal/plan?ejercicio=2020')).body.ventas).toEqual([expect.objectContaining({ asset: 'AAA', cantidad: 1 })]);
    expect((await request(app).delete('/api/fiscal/plan?ejercicio=2020')).body.quitadas).toBe(1);
    expect((await request(app).delete('/api/fiscal/plan?ejercicio=abc')).status).toBe(400);
  });
});
