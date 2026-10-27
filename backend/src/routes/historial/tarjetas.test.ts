import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Tarjetas del resumen (#407): Retirado, Ventas sin conversiones de stablecoin
// a fiat, series por mes y filtro «Tarjeta» de la lista, que muestra justo lo
// que suma cada tarjeta, con y sin margen. Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
const AT = '2025-03-01T10:00:00Z';
const CARDS = { invertido: 'fiat_buys', retirado: 'withdrawn_ops', ventas: 'sells', ingresos: 'income_ops', comisiones: 'fee_ops' } as const;

async function tx(f: Record<string, unknown>) {
  const cols = Object.keys(f);
  return (await pool.query(
    `INSERT INTO transactions (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(f),
  )).rows[0].id as string;
}

describe('tarjetas del resumen y filtro «Tarjeta» (#407)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = (await import('../../db/client')).pool;
    const spot = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Spot test', 'exchange') RETURNING id`)).rows[0].id;
    const margin = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Margen test', 'exchange') RETURNING id`)).rows[0].id;
    const s = { wallet_id: spot, account: 'Spot', timestamp: AT };

    await tx({ ...s, operation_type: 'DEPOSIT_FIAT', asset: 'EUR', amount: 200, amount_net: 200 });
    await tx({ ...s, operation_type: 'BUY', asset: 'XRP', amount: 100, amount_net: 100, cost_asset: 'EUR', cost_amount: 150, fee_asset: 'EUR', fee_amount: 1 });
    // XRP a USDC (venta a stablecoin) y USDC a EUR (conversión, no es otra venta).
    await tx({ ...s, operation_type: 'SELL', asset: 'XRP', amount: 100, amount_net: 100, cost_asset: 'USDC', cost_amount: 160 });
    await tx({ ...s, operation_type: 'SELL', asset: 'USDC', amount: 160, amount_net: 160, cost_asset: 'EUR', cost_amount: 148 });
    await tx({ ...s, operation_type: 'WITHDRAW_FIAT', asset: 'EUR', amount: 120, amount_net: 120 });
    await tx({ ...s, operation_type: 'STAKING_REWARD', asset: 'XRP', amount: 1, amount_net: 1, price_per_unit: 0.5 });
    await tx({ ...s, operation_type: 'FEE_EXCHANGE', asset: 'BNB', amount: 0.01, amount_net: 0.01, fee_asset: 'BNB', fee_amount: 0.01 });
    // Margen: una venta y su comisión.
    await tx({ wallet_id: margin, account: 'Cross Margin', timestamp: AT, operation_type: 'SELL', asset: 'ETH', amount: 1, amount_net: 1,
      cost_asset: 'USDT', cost_amount: 500, fee_asset: 'USDT', fee_amount: 0.5 });

    const { default: stats } = await import('./estadisticas');
    const { default: list } = await import('../transactions/index');
    app = express();
    app.use('/api/v1/historial/estadisticas', stats);
    app.use('/api/transactions', list);
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  const stats = async (qs = '') => (await request(app).get(`/api/v1/historial/estadisticas?${qs}`)).body;

  it('Ventas no suma la conversión de stablecoin a fiat; la cuenta aparte', async () => {
    const { totals } = await stats();
    expect(totals.sells).toBe(1);
    expect(totals.stable_to_fiat.ops).toBe(1);
  });

  it('Retirado suma las retiradas de fiat, con lo depositado para el neto del banco', async () => {
    const { totals } = await stats();
    expect(totals.withdrawn_ops).toBe(1);
    expect(totals.withdrawn.EUR).toBeCloseTo(120, 8);
    expect(totals.deposited.EUR).toBeCloseTo(200, 8);
  });

  it('series por periodo con el importe de cada tarjeta', async () => {
    const { series } = await stats('date_from=2025-01-01&date_to=2025-12-31');
    const marzo = series.find((x: { periodo: string }) => x.periodo === '2025-03');
    expect(marzo.valor.retirado.EUR).toBeCloseTo(120, 8);
    expect(marzo.valor.invertido.EUR).toBeCloseTo(150, 8);
    expect(series.find((x: { periodo: string }) => x.periodo === '2025-04').valor.retirado.EUR).toBe(0);
  });

  it.each(['false', 'true'])('cada tarjeta filtra en la lista justo lo que suma (incluir_margen=%s)', async margen => {
    const { totals } = await stats(`incluir_margen=${margen}`);
    for (const [card, key] of Object.entries(CARDS)) {
      const res = await request(app).get(`/api/transactions?tarjeta=${card}&incluir_margen=${margen}`);
      expect(res.status).toBe(200);
      expect([card, res.body.total]).toEqual([card, totals[key]]);
    }
  });

  it('con margen incluido la venta de margen y su comisión cuentan', async () => {
    expect((await stats('incluir_margen=true')).totals.sells).toBe(2);
    expect((await stats()).totals.fee_ops + 1).toBe((await stats('incluir_margen=true')).totals.fee_ops);
  });

  it('tarjeta inválida: 400 legible', async () => {
    const res = await request(app).get('/api/transactions?tarjeta=otra');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('tarjeta');
  });
});
