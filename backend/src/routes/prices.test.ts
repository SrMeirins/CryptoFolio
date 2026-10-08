import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import { WebSocket } from 'ws';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// getAllLivePrices() ya incluye los precios CoinGecko-only (refresco
// periódico en binance.ts) — este test fija su contenido para verificar que
// GET /live los devuelve tal cual, sin la lógica redundante que antes vivía
// aquí (fetch directo a CoinGecko, eliminada en este mismo turno).
const onPriceUpdateMock = vi.fn();
const offPriceUpdateMock = vi.fn();
vi.mock('../modules/prices/binance', () => ({
  getAllLivePrices: () => new Map([['BTC', 50000], ['EUR', 1], ['NFT', 0.0012]]),
  onPriceUpdate: onPriceUpdateMock,
  offPriceUpdate: offPriceUpdateMock,
  getHistoricalPriceEur: vi.fn(),
  lookupHistoricalPriceEur: vi.fn(),
}));

describe('GET /api/prices/live', () => {
  let testDb: TestDatabase;
  let app: import('express').Express;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    app = (await import('../app')).default;
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  it('devuelve getAllLivePrices() tal cual, incluyendo activos CoinGecko-only', async () => {
    const res = await request(app).get('/api/prices/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ BTC: 50000, EUR: 1, NFT: 0.0012 });
  });
});

describe('GET /api/prices/historical — sin fuga de detalles internos', () => {
  let testDb: TestDatabase;
  let lookupHistoricalPriceEur: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    ({ lookupHistoricalPriceEur } = await import('../modules/prices/binance') as unknown as { lookupHistoricalPriceEur: ReturnType<typeof vi.fn> });
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  it('un fallo interno devuelve un mensaje genérico, no (err as Error).message', async () => {
    const app = (await import('../app')).default;
    lookupHistoricalPriceEur.mockRejectedValueOnce(new Error('detalle interno sensible: timeout en Binance REST'));

    const res = await request(app).get('/api/prices/historical?asset=XRP&date=2025-04-09');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.error).not.toContain('detalle interno sensible');
  });
});

describe('GET /api/prices/historical — validación de parámetros (#146)', () => {
  let testDb: TestDatabase;
  let app: import('express').Express;
  let lookupHistoricalPriceEur: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    app = (await import('../app')).default;
    ({ lookupHistoricalPriceEur } = await import('../modules/prices/binance') as unknown as { lookupHistoricalPriceEur: ReturnType<typeof vi.fn> });
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  it.each([
    ['sin parámetros', ''],
    ['sin fecha', '?asset=XRP'],
    ['símbolo con caracteres no permitidos', '?asset=NO%20EXISTE!&date=2025-04-09'],
    ['símbolo demasiado largo', `?asset=${'A'.repeat(21)}&date=2025-04-09`],
    ['fecha con formato inválido', '?asset=XRP&date=09-04-2025'],
    ['fecha inexistente', '?asset=XRP&date=2025-02-30'],
    ['fecha futura', '?asset=XRP&date=2999-01-01'],
    ['parámetro repetido (array)', '?asset=XRP&asset=BTC&date=2025-04-09'],
  ])('400 con %s, sin consultar precios', async (_caso, query) => {
    lookupHistoricalPriceEur.mockClear();
    const res = await request(app).get(`/api/prices/historical${query}`);

    expect(res.status).toBe(400);
    expect(lookupHistoricalPriceEur).not.toHaveBeenCalled();
  });

  it('normaliza el símbolo a mayúsculas y consulta con la fecha en UTC', async () => {
    lookupHistoricalPriceEur.mockResolvedValueOnce(0.5);
    const res = await request(app).get('/api/prices/historical?asset=xrp&date=2025-04-09');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ asset: 'XRP', date: '2025-04-09', price_eur: 0.5 });
    expect(lookupHistoricalPriceEur).toHaveBeenCalledWith('XRP', new Date('2025-04-09T00:00:00.000Z'));
  });
});

describe('setupPricesWebSocket — ciclo de vida del listener de precios', () => {
  it('al desconectar el cliente, se desuscribe el callback registrado con onPriceUpdate', async () => {
    const { setupPricesWebSocket } = await import('./prices');
    onPriceUpdateMock.mockClear();
    offPriceUpdateMock.mockClear();

    const httpServer = createServer();
    setupPricesWebSocket(httpServer);
    await new Promise<void>(resolve => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;

    const client = new WebSocket(`ws://127.0.0.1:${port}/ws/prices`);
    await new Promise<void>((resolve, reject) => {
      client.on('open', resolve);
      client.on('error', reject);
    });
    expect(onPriceUpdateMock).toHaveBeenCalledTimes(1);
    const registeredHandler = onPriceUpdateMock.mock.calls[0][0];

    client.close();
    await new Promise<void>(resolve => client.on('close', resolve));
    // onPriceUpdate es async respecto al cierre del socket (evento 'close'
    // del servidor WS) — se da margen antes de comprobar la desuscripción.
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(offPriceUpdateMock).toHaveBeenCalledWith(registeredHandler);
    httpServer.close();
  });
});
