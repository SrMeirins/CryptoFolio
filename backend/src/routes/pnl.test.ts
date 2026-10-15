import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// GET /api/v1/pnl/daily (#165): validación de parámetros y respuesta.
const { getDailyPnlMock, getIntradayPnlMock, getDayDetailMock } = vi.hoisted(() => ({
  getDailyPnlMock: vi.fn(), getIntradayPnlMock: vi.fn(), getDayDetailMock: vi.fn(),
}));
vi.mock('../modules/pnl/pnlService', () => ({ getDailyPnl: getDailyPnlMock }));
vi.mock('../modules/pnl/intraday', () => ({ getIntradayPnl: getIntradayPnlMock }));
vi.mock('../modules/pnl/dayDetail', () => ({ getDayDetail: getDayDetailMock }));

let testDb: TestDatabase;
let app: import('express').Express;

describe('GET /api/v1/pnl/daily', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    app = (await import('../app')).default;
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  it.each([
    ['fecha con formato inválido', '?from=01-01-2026'],
    ['fecha inexistente', '?from=2026-02-30'],
    ['from posterior a to', '?from=2026-03-01&to=2026-02-01'],
    ['to futura', '?to=2999-01-01'],
    ['rango de más de ~10 años', '?from=2010-01-01&to=2026-01-01'],
    ['parámetro desconocido', '?desde=2026-01-01'],
    ['parámetro repetido', '?from=2026-01-01&from=2026-01-02'],
    ['moneda no soportada', '?currency=GBP'],
  ])('400 con %s, sin calcular', async (_caso, query) => {
    getDailyPnlMock.mockClear();
    const res = await request(app).get(`/api/v1/pnl/daily${query}`);
    expect(res.status).toBe(400);
    expect(getDailyPnlMock).not.toHaveBeenCalled();
  });

  it('con parámetros válidos devuelve el resultado del servicio', async () => {
    const body = { from: '2026-01-01', to: '2026-01-31', timezone: 'Europe/Madrid', refreshing: false, totalPnl: 0, twrPct: 0, days: [] };
    getDailyPnlMock.mockResolvedValueOnce(body);
    const res = await request(app).get('/api/v1/pnl/daily?from=2026-01-01&to=2026-01-31');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
    expect(getDailyPnlMock).toHaveBeenCalledWith({ from: '2026-01-01', to: '2026-01-31', currency: 'EUR' });
  });

  it('un error interno devuelve un mensaje genérico', async () => {
    getDailyPnlMock.mockRejectedValueOnce(new Error('detalle interno sensible'));
    const res = await request(app).get('/api/v1/pnl/daily');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('sensible');
  });
});

describe('GET /api/v1/pnl/intraday (#215)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    app = (await import('../app')).default;
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  it.each([
    ['moneda no soportada', '?currency=GBP'],
    ['parámetro desconocido', '?from=2026-01-01'],
  ])('400 con %s, sin calcular', async (_caso, query) => {
    getIntradayPnlMock.mockClear();
    const res = await request(app).get(`/api/v1/pnl/intraday${query}`);
    expect(res.status).toBe(400);
    expect(getIntradayPnlMock).not.toHaveBeenCalled();
  });

  it('devuelve la serie del servicio en la moneda pedida (EUR por defecto)', async () => {
    const body = { currency: 'USD', stepMinutes: 15, points: [] };
    getIntradayPnlMock.mockResolvedValueOnce(body);
    const res = await request(app).get('/api/v1/pnl/intraday?currency=USD');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
    expect(getIntradayPnlMock).toHaveBeenCalledWith('USD');
    getIntradayPnlMock.mockResolvedValueOnce(body);
    await request(app).get('/api/v1/pnl/intraday');
    expect(getIntradayPnlMock).toHaveBeenLastCalledWith('EUR');
  });

  it('un error interno devuelve un mensaje genérico', async () => {
    getIntradayPnlMock.mockRejectedValueOnce(new Error('detalle interno sensible'));
    const res = await request(app).get('/api/v1/pnl/intraday');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('sensible');
  });
});

describe('GET /api/v1/pnl/day (#216)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    app = (await import('../app')).default;
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  it.each([
    ['sin fecha', ''],
    ['fecha inexistente', '?date=2026-02-30'],
    ['fecha futura', '?date=2999-01-01'],
    ['moneda no soportada', '?date=2026-01-01&currency=GBP'],
    ['parámetro desconocido', '?date=2026-01-01&x=1'],
  ])('400 con %s, sin calcular', async (_caso, query) => {
    getDayDetailMock.mockClear();
    const res = await request(app).get(`/api/v1/pnl/day${query}`);
    expect(res.status).toBe(400);
    expect(getDayDetailMock).not.toHaveBeenCalled();
  });

  it('devuelve el detalle o 404 si no hubo actividad', async () => {
    getDayDetailMock.mockResolvedValueOnce({ date: '2026-01-01', pnl: 1, contributions: [], other: 1 });
    const ok = await request(app).get('/api/v1/pnl/day?date=2026-01-01&currency=USD');
    expect(ok.status).toBe(200);
    expect(getDayDetailMock).toHaveBeenCalledWith('2026-01-01', 'USD');
    getDayDetailMock.mockResolvedValueOnce(null);
    expect((await request(app).get('/api/v1/pnl/day?date=2020-01-01')).status).toBe(404);
  });

  it('un error interno devuelve un mensaje genérico', async () => {
    getDayDetailMock.mockRejectedValueOnce(new Error('detalle interno sensible'));
    const res = await request(app).get('/api/v1/pnl/day?date=2026-01-01');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('sensible');
  });
});
