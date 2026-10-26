import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Zona horaria configurable (#388) con la app completa y datos sintéticos: la
// misma venta del 31/12 a las 23:30 UTC (00:30 del 1 de enero en la península)
// cuenta en 2025 con Madrid y en 2024 con Canarias.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let invalidate: () => void;
const NOCHEVIEJA = '2024-12-31T23:30:00Z';

async function seedSale(walletId: string, at: string, gain: number) {
  const tx = await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
     VALUES ('SELL', $1, 'BTC', 1, 1, $2) RETURNING id`, [at, walletId]);
  const lot = await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ('BTC', 1, 0, 0, 0, $1, '2023-01-01T00:00:00Z', $2, TRUE) RETURNING id`, [tx.rows[0].id, walletId]);
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, 1, 0, $3, $4, 'GAIN', $5)`, [lot.rows[0].id, tx.rows[0].id, gain, gain, at]);
}
const setTz = (value: string) => request(app).put('/api/settings/config').send({ key: 'timezone', value });

describe('zona horaria configurable (#388)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    delete process.env.APP_TIMEZONE;
    pool = (await import('../../db/client')).pool;
    const w = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Exchange zona', 'exchange') RETURNING id`)).rows[0].id;
    await seedSale(w, NOCHEVIEJA, 100);
    app = (await import('../../app')).default;
    invalidate = (await import('../../modules/time/appTimezone')).invalidateTimezoneCache;
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  it('sin ajuste ni variable: Europe/Madrid por defecto, y la venta cuenta en 2025', async () => {
    expect((await request(app).get('/api/settings/timezone')).body).toEqual({ timezone: 'Europe/Madrid', source: 'defecto', invalidSetting: null, default: 'Europe/Madrid' });
    expect((await request(app).get('/api/fiscal/years')).body).toEqual([2025]);
    expect((await request(app).get('/api/fifo/summary')).body.map((r: { fiscal_year: number }) => r.fiscal_year)).toEqual([2025]);
    expect((await request(app).get('/api/transactions?date_from=2025-01-01&date_to=2025-01-01')).body.total).toBe(1);
  });

  it('con Atlantic/Canary la misma venta cuenta en 2024, en Fiscal y en los filtros del Historial', async () => {
    expect((await setTz('Atlantic/Canary')).status).toBe(200);
    expect((await request(app).get('/api/settings/timezone')).body).toMatchObject({ timezone: 'Atlantic/Canary', source: 'ajuste' });
    expect((await request(app).get('/api/fiscal/years')).body).toEqual([2024]);
    expect((await request(app).get('/api/fifo/summary')).body.map((r: { fiscal_year: number }) => r.fiscal_year)).toEqual([2024]);
    expect((await request(app).get('/api/fiscal/overview')).body.map((r: { year: number }) => r.year)).toEqual([2024]);
    expect((await request(app).get('/api/transactions?date_from=2024-12-31&date_to=2024-12-31')).body.total).toBe(1);
    expect((await request(app).get('/api/transactions?date_from=2025-01-01&date_to=2025-01-01')).body.total).toBe(0);
  });

  it.each([
    ['una zona desconocida', 'Marte/Olimpo'],
    ['una inyección SQL', "Europe/Madrid'; DROP TABLE transactions; --"],
    ['mayúsculas mal escritas', 'europe/madrid'],
  ])('%s en Ajustes devuelve 400 y no cambia la zona', async (_c, value) => {
    const res = await setTz(value);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('zona horaria IANA');
    expect((await request(app).get('/api/settings/timezone')).body.timezone).toBe('Atlantic/Canary');
    expect((await pool.query(`SELECT to_regclass('transactions') AS t`)).rows[0].t).toBe('transactions');
  });

  it('un valor vacío borra el ajuste y vuelve a la zona por defecto', async () => {
    expect((await setTz('')).status).toBe(200);
    expect((await request(app).get('/api/settings/timezone')).body).toMatchObject({ timezone: 'Europe/Madrid', source: 'defecto' });
    expect((await request(app).get('/api/fiscal/years')).body).toEqual([2025]);
  });

  it('un ajuste guardado inválido (editado a mano) se ignora y se informa', async () => {
    await pool.query(`INSERT INTO app_config (key, value) VALUES ('timezone', 'Marte/Olimpo') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    invalidate();
    expect((await request(app).get('/api/settings/timezone')).body).toMatchObject({ timezone: 'Europe/Madrid', source: 'defecto', invalidSetting: 'Marte/Olimpo' });
    expect((await request(app).get('/api/fiscal/years')).status).toBe(200);
    await setTz('');
  });
});
