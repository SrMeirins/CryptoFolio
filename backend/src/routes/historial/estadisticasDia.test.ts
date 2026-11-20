import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Estadísticas por días (#516): el gráfico agrupa por días de la zona de la
// app (Europe/Madrid por defecto). Datos sintéticos que cruzan medianoche:
// 22:30 UTC del 1 de marzo es el mismo día en Madrid (23:30), 23:30 UTC ya
// es el 2 de marzo (00:30).
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('GET /api/v1/historial/estadisticas?granularidad=dia (#516)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = (await import('../../db/client')).pool;
    const w = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Spot dia', 'exchange') RETURNING id`)).rows[0].id;
    const ins = (op: string, asset: string, at: string) => pool.query(
      `INSERT INTO transactions (wallet_id, account, timestamp, operation_type, asset, amount, amount_net, cost_asset, cost_amount)
       VALUES ($1, 'Spot', $2, $3, $4, 1, 1, 'EUR', 10)`, [w, at, op, asset]);
    await ins('BUY', 'BTC', '2025-03-01T22:30:00Z');
    await ins('BUY', 'ETH', '2025-03-01T23:30:00Z');
    await ins('STAKING_REWARD', 'ADA', '2025-03-02T09:00:00Z');
    const { default: stats } = await import('./estadisticas');
    app = express();
    app.use('/api/v1/historial/estadisticas', stats);
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  const get = async (qs: string) => request(app).get(`/api/v1/historial/estadisticas?${qs}`);

  it('agrupa por días de la zona de la app: lo de las 23:30 UTC cuenta en el día siguiente', async () => {
    const { body, status } = await get('granularidad=dia&date_from=2025-02-28&date_to=2025-03-03');
    expect(status).toBe(200);
    expect(body.chart).toMatchObject({ granularity: 'day', from: '2025-02-28', to: '2025-03-03' });
    const dia = (d: string) => body.chart.buckets.find((b: { periodo: string }) => b.periodo === d);
    expect(body.chart.buckets.map((b: { periodo: string }) => b.periodo)).toEqual(['2025-02-28', '2025-03-01', '2025-03-02', '2025-03-03']);
    expect(dia('2025-03-01').ops.compras).toBe(1);
    expect(dia('2025-03-02').ops).toMatchObject({ compras: 1, ingresos: 1 });
    expect(dia('2025-02-28').ops.compras).toBe(0);
  });

  it('una granularidad desconocida es un 400', async () => {
    expect((await get('granularidad=hora')).status).toBe(400);
  });
});
