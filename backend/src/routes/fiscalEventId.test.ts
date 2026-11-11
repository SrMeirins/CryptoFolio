import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Una venta que consume varios lotes genera varios eventos fiscales con el
// mismo txId; la tabla de Fiscal los usaba como clave y React duplicaba u
// omitía filas (#201). Cada evento lleva ahora un identificador propio.
vi.mock('../modules/prices/binance', () => ({ getHistoricalPriceEur: vi.fn(async () => 1) }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('GET /api/fiscal/:year/events — identificador único por evento (#201)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('W', 'exchange') RETURNING id`)).rows[0].id;

    const lot = async (fecha: string, cost: number, fee = 0, cantidad = 1) => {
      const tx = await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
         VALUES ('BUY', $1, 'BTC', 1, 1, $2) RETURNING id`, [fecha, walletId]);
      return (await pool.query(
        `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, fee_eur, open_transaction_id, opened_at, wallet_id, is_closed)
         VALUES ('BTC', $6, 0, $1, $1, $5, $2, $3, $4, TRUE) RETURNING id`, [cost, tx.rows[0].id, fecha, walletId, fee, cantidad])).rows[0].id as string;
    };
    // El lote A costó 100 € con 10 € de comisión incluida, y se compraron 2 BTC (se consume 1).
    const lotA = await lot('2024-01-01T10:00:00Z', 100, 10, 2);
    const lotB = await lot('2024-02-01T10:00:00Z', 200);

    // Una sola venta de 2 BTC que consume los dos lotes.
    const sell = (await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, fee_asset, fee_amount, wallet_id)
       VALUES ('SELL', '2025-03-01T10:00:00Z', 'BTC', 2, 2, 'EUR', 'EUR', 3, $1) RETURNING id`, [walletId])).rows[0].id;
    for (const [lotId, cost] of [[lotA, 100], [lotB, 200]] as const) {
      await pool.query(
        `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
         VALUES ($1, $2, 1, $3, 300, $4, 'GAIN', '2025-03-01T10:00:00Z')`, [lotId, sell, cost, 300 - cost]);
    }

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('dos eventos de la misma operación tienen el mismo txId pero distinto eventId', async () => {
    const res = await request(app).get('/api/fiscal/2025/events');
    expect(res.status).toBe(200);
    const events = res.body.fiscalEvents as Array<{ txId: string; eventId: string }>;
    expect(events).toHaveLength(2);
    expect(events[0].txId).toBe(events[1].txId);
    expect(typeof events[0].eventId).toBe('string');
    expect(new Set(events.map(e => e.eventId)).size).toBe(2);
  });

  it('la venta por EUR lleva la clave F de la casilla 1800 (#531)', async () => {
    const events = (await request(app).get('/api/fiscal/2025/events')).body.fiscalEvents as Array<{ contrapartidaClave: string; contrapartidaRevisar: boolean }>;
    expect(events.every(e => e.contrapartidaClave === 'F' && e.contrapartidaRevisar === false)).toBe(true);
  });

  it('la comisión se reparte entre los lotes y suma exactamente la de la operación (#543)', async () => {
    const events = (await request(app).get('/api/fiscal/2025/events')).body.fiscalEvents as Array<{ gastosTransmisionEur: number }>;
    // 3 € de comisión (precio simulado 1) en una venta que consume 1 + 1 BTC: 1,5 € por lote.
    expect(events.map(e => e.gastosTransmisionEur)).toEqual([1.5, 1.5]);
    expect(events.reduce((t, e) => t + e.gastosTransmisionEur, 0)).toBeCloseTo(3, 9);
  });

  it('cada evento lleva la fecha de compra de su lote (#543)', async () => {
    const events = (await request(app).get('/api/fiscal/2025/events')).body.fiscalEvents as Array<{ fechaAdquisicion: string }>;
    expect(events.map(e => e.fechaAdquisicion).sort()).toEqual(['2024-01-01', '2024-02-01']);
  });

  it('valores y gastos por separado, como la Renta: cuadran con la ganancia del FIFO (#543)', async () => {
    const events = (await request(app).get('/api/fiscal/2025/events')).body.fiscalEvents as Array<{
      fechaAdquisicion: string; valorTransmisionEur: number; gastosTransmisionEur: number; valorAdquisicionEur: number; gastosAdquisicionEur: number; gananciaPerdidaEur: number
    }>
    for (const e of events) {
      expect((e.valorTransmisionEur - e.gastosTransmisionEur) - (e.valorAdquisicionEur + e.gastosAdquisicionEur)).toBeCloseTo(e.gananciaPerdidaEur, 9);
    }
    const a = events.find(e => e.fechaAdquisicion === '2024-01-01')!;
    // Mitad del lote: 5 € de los 10 de comisión; el valor de adquisición, sin ella.
    expect(a).toMatchObject({ gastosAdquisicionEur: 5, valorAdquisicionEur: 95, valorTransmisionEur: 301.5, gastosTransmisionEur: 1.5 });
  });

  it('Renta Web exporta las cuatro cifras y cuadran (#543)', async () => {
    const csv = (await request(app).get('/api/fiscal/2025/export?format=rentaweb')).text;
    const linea = csv.split('\r\n').find(l => l.includes(';95,00;'))!;
    expect(linea.split(';').slice(4)).toEqual(['301,50', '1,50', '95,00', '5,00', '200,00']);
  });
});
