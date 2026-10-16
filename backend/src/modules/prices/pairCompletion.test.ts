import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Relleno de pares de Binance (#277), sin red real: exchangeInfo simulado.
const { resyncMock } = vi.hoisted(() => ({ resyncMock: vi.fn() }));
vi.mock('./liveFeed', () => ({ requestLivePriceResync: resyncMock }));

let testDb: TestDatabase;
let pool: Pool;
let mod: typeof import('./pairCompletion');

const TRADING = ['ADAUSDT', 'ADABTC', 'ADAEUR', 'XRPUSDT', 'XRPEUR', 'XRPBTC', 'XRPETH', 'NEWCOINUSDT', 'BTCUSDT', 'BTCEUR'];

function stubExchangeInfo(symbols: string[]) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    symbols: [...symbols.map(symbol => ({ symbol, status: 'TRADING' })), { symbol: 'OLDUSDT', status: 'BREAK' }],
  }), { status: 200 })));
}

const pairs = async (symbol: string) => (await pool.query(
  `SELECT binance_eur_pair AS eur, binance_usdt_pair AS usdt, binance_btc_pair AS btc, binance_eth_pair AS eth, price_source
   FROM asset_metadata WHERE symbol = $1`, [symbol],
)).rows[0];

describe('missingPairs', () => {
  beforeAll(async () => { mod = await import('./pairCompletion'); });
  const row = (symbol: string, extra: Record<string, unknown> = {}) => ({
    symbol, binance_eur_pair: null, binance_usdt_pair: null, binance_btc_pair: null, binance_eth_pair: null,
    price_source: 'eur_direct', disabled_pairs: [] as string[], ...extra,
  });
  const trading = new Set(TRADING);

  it('rellena los pares que faltan y existen; respeta los ya configurados', () => {
    expect(mod.missingPairs(row('ADA', { binance_eur_pair: 'ADAEUR' }), trading)).toEqual({ usdt: 'ADAUSDT', btc: 'ADABTC' });
  });
  it('no vuelve a añadir los pares quitados a mano', () => {
    expect(mod.missingPairs(row('XRP', { disabled_pairs: ['usdt', 'eth'] }), trading)).toEqual({ eur: 'XRPEUR', btc: 'XRPBTC' });
  });
  it('ni pares inexistentes ni el activo contra sí mismo', () => {
    expect(mod.missingPairs(row('BTC'), trading)).toEqual({ eur: 'BTCEUR', usdt: 'BTCUSDT' });
    expect(mod.missingPairs(row('NADA'), trading)).toEqual({});
  });
});

describe('completeAssetPairs', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    await pool.query(`UPDATE asset_metadata SET binance_usdt_pair = NULL, binance_btc_pair = NULL, binance_eth_pair = NULL, disabled_pairs = '{}' WHERE symbol IN ('ADA', 'XRP')`);
    await pool.query(`UPDATE asset_metadata SET disabled_pairs = '{btc}' WHERE symbol = 'XRP'`);
    await pool.query(`INSERT INTO asset_metadata (symbol, name, price_source) VALUES ('NEWCOIN', 'NEWCOIN', 'unknown')`);
    vi.resetModules();
    mod = await import('./pairCompletion');
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('completa los pares de los activos precargados y avisa al feed en vivo', async () => {
    stubExchangeInfo(TRADING);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const changed = await mod.completeAssetPairs();
    expect(changed).toBeGreaterThanOrEqual(3);
    expect(await pairs('ADA')).toMatchObject({ eur: 'ADAEUR', usdt: 'ADAUSDT', btc: 'ADABTC' });
    expect(await pairs('XRP')).toMatchObject({ usdt: 'XRPUSDT', btc: null, eth: 'XRPETH' });   // btc desactivado a mano
    expect(resyncMock).toHaveBeenCalled();
  });

  it('un activo sin fuente pasa a cotizar por su par nuevo', async () => {
    expect(await pairs('NEWCOIN')).toMatchObject({ usdt: 'NEWCOINUSDT', price_source: 'usdt_proxy' });
  });

  it('sin nada que completar no toca la base ni el feed; un fallo de Binance no lanza', async () => {
    resyncMock.mockClear();
    expect(await mod.completeAssetPairs()).toBe(0);
    expect(resyncMock).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 451 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(mod.completeAssetPairs()).resolves.toBe(0);
  });
});
