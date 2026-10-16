import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// #267: un fallo de red (bloqueo por región HTTP 451, sin conexión…) no debe
// guardar el «sin precio» permanente; solo cuando las fuentes responden sin datos.
const { cgPrice, cgTransient } = vi.hoisted(() => ({ cgPrice: vi.fn(), cgTransient: vi.fn() }));
vi.mock('./coingecko', async importOriginal => ({
  ...(await importOriginal<typeof import('./coingecko')>()),
  getHistoricalPriceEur: cgPrice,
  searchAndSaveCoinGeckoId: vi.fn(async () => 'ripple'),
}));
vi.mock('./coingeckoIds', async importOriginal => ({
  ...(await importOriginal<typeof import('./coingeckoIds')>()),
  coinGeckoSearchFailedTransiently: cgTransient,
}));

let testDb: TestDatabase;
let pool: Pool;
let binance: typeof import('./binance');

const sentinels = async (asset: string) =>
  Number((await pool.query(`SELECT count(*) FROM price_cache WHERE asset = $1 AND price_eur < 0`, [asset])).rows[0].count);

function binanceReplies(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })));
}

describe('getHistoricalPriceEur — fallos temporales frente a falta de datos (#267)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    binance = await import('./binance');
  });

  beforeEach(() => {
    cgPrice.mockReset();
    cgTransient.mockReset().mockReturnValue(false);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('clasifica los motivos de fallo de Binance', () => {
    expect(binance.isDefinitiveNoData(new Error('no pair'))).toBe(true);
    expect(binance.isDefinitiveNoData(new Error('Sin datos para XRPEUR @ 2024-12-31'))).toBe(true);
    expect(binance.isDefinitiveNoData(new Error('Binance klines HTTP 400 para FOOEUR'))).toBe(true);
    expect(binance.isDefinitiveNoData(new Error('Binance klines HTTP 451 para XRPEUR'))).toBe(false);
    expect(binance.isDefinitiveNoData(new Error('fetch failed'))).toBe(false);
    expect(binance.isDefinitiveNoData(new Error('fetchKlinePrice agotó reintentos para XRPEUR'))).toBe(false);
  });

  it('Binance bloqueado (451) y CoinGecko caído: 0 sin guardar «sin precio» y sin reintentar enseguida', async () => {
    binanceReplies(451, { msg: 'restricted location' });
    cgPrice.mockRejectedValue(new Error('fetch failed'));
    const date = new Date('2024-12-31T23:59:59Z');
    expect(await binance.getHistoricalPriceEur('XRP', date)).toBe(0);
    expect(await sentinels('XRP')).toBe(0);
    // Segunda consulta dentro de la espera: no vuelve a llamar a las fuentes.
    const calls = vi.mocked(fetch).mock.calls.length;
    expect(await binance.getHistoricalPriceEur('XRP', date)).toBe(0);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  });

  it('las fuentes responden sin datos: se guarda el «sin precio» definitivo', async () => {
    binanceReplies(200, []);   // vela vacía
    cgPrice.mockResolvedValue(0);
    expect(await binance.getHistoricalPriceEur('XRP', new Date('2023-06-30T23:59:59Z'))).toBe(0);
    expect(await sentinels('XRP')).toBe(1);
  });

  it('sin coingecko_id por un fallo de red en la búsqueda: temporal, sin «sin precio»', async () => {
    binanceReplies(200, []);
    cgPrice.mockResolvedValue(0);
    cgTransient.mockReturnValue(true);
    expect(await binance.getHistoricalPriceEur('XRP', new Date('2022-06-30T23:59:59Z'))).toBe(0);
    expect(await sentinels('XRP')).toBe(1);   // solo el del test anterior
  });
});
