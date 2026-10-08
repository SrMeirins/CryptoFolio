import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// GET /api/v1/pnl/daily (#165): validación de parámetros y respuesta.
const { getDailyPnlMock } = vi.hoisted(() => ({ getDailyPnlMock: vi.fn() }));
vi.mock('../modules/pnl/pnlService', () => ({ getDailyPnl: getDailyPnlMock }));

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
    expect(getDailyPnlMock).toHaveBeenCalledWith({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('un error interno devuelve un mensaje genérico', async () => {
    getDailyPnlMock.mockRejectedValueOnce(new Error('detalle interno sensible'));
    const res = await request(app).get('/api/v1/pnl/daily');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('sensible');
  });
});
