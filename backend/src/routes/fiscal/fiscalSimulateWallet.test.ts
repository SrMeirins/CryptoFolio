import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Simulador de venta (#279): FIFO por wallet, IRPF marginal, recompra y comisión.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
const ids: Record<string, string> = {};

async function lot(wallet: string, openedAt: string, qty: number, unit: number, op = 'BUY') {
  const tx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ($1::operation_type, $2, 'ADA', $3, $3, $4) RETURNING id`, [op, openedAt, qty, ids[wallet]],
  );
  const l = await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ('ADA', $1, $1, $2, $3, $4, $5, $6, FALSE) RETURNING id`, [qty, qty * unit, unit, tx.rows[0].id, openedAt, ids[wallet]],
  );
  return { lotId: l.rows[0].id as string, txId: tx.rows[0].id as string };
}

describe('POST /api/fiscal/simulate-sale — wallet, IRPF marginal, recompra y comisión (#279)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    for (const name of ['Binance Spot', 'Binance Funding']) {
      ids[name] = (await pool.query(`SELECT id FROM wallets WHERE name = $1`, [name])).rows[0].id;
    }
    // Funding tiene el lote más antiguo y barato; Spot, más cantidad.
    await lot('Binance Funding', '2023-01-01T10:00:00Z', 50, 0.1);
    await lot('Binance Spot', '2024-01-01T10:00:00Z', 100, 0.5);
    await lot('Binance Spot', '2024-03-01T10:00:00Z', 100, 0.8);
    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('por defecto vende en la wallet con más cantidad y aplica FIFO solo con sus lotes', async () => {
    const res = await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 150, priceEur: 1 });
    expect(res.status).toBe(200);
    expect(res.body.walletId).toBe(ids['Binance Spot']);
    expect(res.body.wallets.map((w: { walletName: string; quantity: number }) => [w.walletName, w.quantity]))
      .toEqual([['Binance Spot', 200], ['Binance Funding', 50]]);
    // 100 × 0,5 + 50 × 0,8 = 90 de coste (el lote de Funding, más antiguo, no se toca)
    expect(res.body.totalCostBasis).toBeCloseTo(90, 6);
    expect(res.body.lotsConsumed.map((l: { partial: boolean }) => l.partial)).toEqual([false, true]);
  });

  it('se puede elegir la wallet; vender más de lo que tiene da 400', async () => {
    const ok = await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 50, priceEur: 1, walletId: ids['Binance Funding'] });
    expect(ok.body.totalCostBasis).toBeCloseTo(5, 6);
    const tooMuch = await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 60, priceEur: 1, walletId: ids['Binance Funding'] });
    expect(tooMuch.status).toBe(400);
  });

  it('la comisión reduce la ganancia', async () => {
    const res = await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 100, priceEur: 1, feePct: 0.1 });
    expect(res.body.totalFee).toBeCloseTo(0.1, 6);
    expect(res.body.netGainLoss).toBeCloseTo(49.9, 2);
  });

  it('IRPF marginal: depende de lo ya realizado en el año', async () => {
    const sin = await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 100, priceEur: 1 });
    expect(sin.body.irpf.baseAntes).toBeCloseTo(0, 6);
    expect(sin.body.irpf.marginal).toBeCloseTo(9.5, 2);   // 50 € al 19 %

    // Ganancia ya realizada este año: 6.000 € (llena el primer tramo).
    const { lotId, txId } = await lot('Binance Funding', '2023-02-01T10:00:00Z', 1, 0);
    await pool.query(
      `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
       VALUES ($1, $2, 1, 0, 6000, 6000, 'GAIN', NOW())`, [lotId, txId],
    );
    const con = await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 100, priceEur: 1 });
    expect(con.body.irpf.baseAntes).toBeCloseTo(6_000, 6);
    expect(con.body.irpf.marginal).toBeCloseTo(10.5, 2);  // 50 € al 21 %
    expect(con.body.irpf.desglose.map((t: { tipo: number }) => t.tipo)).toEqual([21]);
  });

  it('con pérdida y compras recientes, avisa de la regla de recompra', async () => {
    await lot('Binance Spot', new Date(Date.now() - 20 * 86_400_000).toISOString(), 10, 0.9);
    const res = await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 100, priceEur: 0.2 });
    expect(res.body.netGainLoss).toBeLessThan(0);
    expect(res.body.recompra.aviso).toBe(true);
    expect(res.body.recompra.comprasRecientes).toHaveLength(1);
    const gain = await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 100, priceEur: 2 });
    expect(gain.body.recompra.aviso).toBe(false);
  });

  it('walletId inválido o comisión fuera de rango: 400', async () => {
    expect((await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 1, priceEur: 1, walletId: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 1, priceEur: 1, feePct: 50 })).status).toBe(400);
  });

  it('curva (#280): resultado neto por precio, coherente con la simulación puntual', async () => {
    const res = await request(app).post('/api/fiscal/simulate-sale/curve')
      .send({ asset: 'ADA', quantity: 100, prices: [0, 0.5, 1, 2] });
    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(4);
    const prices = res.body.points.map((p: { price: number }) => p.price);
    expect(prices).toEqual([0, 0.5, 1, 2]);
    const results = res.body.points.map((p: { resultadoNeto: number }) => p.resultadoNeto);
    expect(results[1]).toBeCloseTo(0, 6);                    // a 0,5 € (precio medio de esos 100) no se gana ni se pierde
    expect(results[3]).toBeGreaterThan(results[2]);           // crece con el precio
    const puntual = await request(app).post('/api/fiscal/simulate-sale').send({ asset: 'ADA', quantity: 100, priceEur: 2 });
    expect(res.body.points[3].netoEnMano).toBeCloseTo(puntual.body.netoEnMano, 6);
  });

  it('cantidad para un neto en mano (#280): la simulación con esa cantidad da ese neto', async () => {
    const res = await request(app).post('/api/fiscal/simulate-sale/quantity')
      .send({ asset: 'ADA', priceEur: 1, targetNet: 80, feePct: 0.1 });
    expect(res.status).toBe(200);
    expect(res.body.alcanzable).toBe(true);
    const check = await request(app).post('/api/fiscal/simulate-sale')
      .send({ asset: 'ADA', quantity: res.body.quantity, priceEur: 1, feePct: 0.1 });
    expect(check.body.netoEnMano).toBeCloseTo(80, 2);
  });

  it('neto inalcanzable con lo que hay en la wallet: cantidad máxima y aviso', async () => {
    const res = await request(app).post('/api/fiscal/simulate-sale/quantity')
      .send({ asset: 'ADA', priceEur: 1, targetNet: 1_000_000 });
    expect(res.body.alcanzable).toBe(false);
    expect(res.body.quantity).toBeCloseTo(210, 6);   // todo lo de Binance Spot (200 + el lote reciente de 10)
  });

  it('curva y cantidad validan sus datos', async () => {
    expect((await request(app).post('/api/fiscal/simulate-sale/curve').send({ asset: 'ADA', quantity: 1, prices: [1] })).status).toBe(400);
    expect((await request(app).post('/api/fiscal/simulate-sale/quantity').send({ asset: 'ADA', priceEur: 0, targetNet: 1 })).status).toBe(400);
  });
});
