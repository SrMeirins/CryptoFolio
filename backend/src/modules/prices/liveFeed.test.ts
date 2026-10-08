import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Suscripciones dinámicas del feed en vivo (#149): sin red ni Postgres reales.
// El WebSocket de Binance se sustituye por un doble que registra la URL de
// cada conexión y permite simular cierres.

interface FakeSocket {
  url: string;
  closed: boolean;
  handlers: Record<string, (...args: unknown[]) => void>;
  close(): void;
}

const { sockets, queryMock, assetRows } = vi.hoisted(() => ({
  sockets: [] as FakeSocket[],
  queryMock: vi.fn(),
  assetRows: { current: [] as Array<Record<string, string | null>> },
}));

vi.mock('ws', () => {
  class WebSocket {
    url: string;
    closed = false;
    handlers: Record<string, (...args: unknown[]) => void> = {};
    constructor(url: string) {
      this.url = url;
      sockets.push(this as unknown as FakeSocket);
    }
    on(event: string, cb: (...args: unknown[]) => void) { this.handlers[event] = cb; return this; }
    close() { this.closed = true; this.handlers.close?.(); }
  }
  return { WebSocket };
});

vi.mock('../../db/client', () => ({ db: { query: queryMock } }));
vi.mock('./pairDetector', () => {
  // Info de pares derivada de las filas simuladas de asset_metadata.
  const infoFor = (symbol: string) => {
    const row = assetRows.current.find(r => r.symbol === symbol);
    return row ? {
      symbol,
      binanceEurPair: row.binance_eur_pair, binanceUsdtPair: row.binance_usdt_pair,
      binanceBtcPair: row.binance_btc_pair, binanceEthPair: row.binance_eth_pair,
      priceSource: row.price_source, isStablecoin: false,
    } : null;
  };
  return {
    loadPairCache: vi.fn(async () => {}),
    getPairInfo: vi.fn(infoFor),
    getOrDetectPairInfo: vi.fn(async (symbol: string) => infoFor(symbol)),
  };
});
vi.mock('./coingecko', () => ({
  getCurrentPricesEur: vi.fn(async () => new Map()),
  loadAssetMetadata: vi.fn(async () => {}),
}));

function asset(symbol: string, pairs: Partial<Record<'binance_eur_pair' | 'binance_usdt_pair' | 'binance_btc_pair' | 'binance_eth_pair', string>>) {
  return {
    symbol,
    binance_eur_pair: null, binance_usdt_pair: null, binance_btc_pair: null, binance_eth_pair: null,
    price_source: 'eur_direct', is_stablecoin: false,
    ...pairs,
  };
}

const lastSocket = () => sockets[sockets.length - 1];
const streamsOf = (s: FakeSocket) => new URL(s.url).searchParams.get('streams')!.split('/').sort();

describe('liveFeed — suscripciones dinámicas (#149)', () => {
  let feed: typeof import('./liveFeed');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    sockets.length = 0;
    assetRows.current = [asset('XRP', { binance_eur_pair: 'XRPEUR' })];
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) =>
      String(sql).includes('FROM asset_metadata') ? { rows: assetRows.current } : { rows: [] });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));

    feed = await import('./liveFeed');
    feed.startLivePrices();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
  });

  afterEach(() => {
    feed.stopLivePrices();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('al arrancar se suscribe a los pares del índice vigente', () => {
    expect(streamsOf(sockets[0])).toEqual(['eurusdt@miniTicker', 'xrpeur@miniTicker']);
  });

  it('un activo añadido tras el arranque se suscribe sin reiniciar y la conexión anterior no se reconecta', async () => {
    assetRows.current = [...assetRows.current, asset('HBAR', { binance_usdt_pair: 'HBARUSDT' })];

    await feed.syncLivePriceSubscriptions();

    expect(sockets).toHaveLength(2);
    expect(streamsOf(lastSocket())).toContain('hbarusdt@miniTicker');
    expect(sockets[0].closed).toBe(true);

    vi.advanceTimersByTime(10_000); // el cierre deliberado no programa reconexión
    expect(sockets).toHaveLength(2);
  });

  it('el activo añadido recibe un precio inmediato por REST, sin esperar al primer tick', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => [{ symbol: 'EURUSDT', price: '1.25' }, { symbol: 'HBARUSDT', price: '0.2' }],
    })));
    assetRows.current = [...assetRows.current, asset('HBAR', { binance_usdt_pair: 'HBARUSDT' })];

    await feed.syncLivePriceSubscriptions();

    expect(feed.getLivePrice('HBAR')).toBeCloseTo(0.16, 10);
  });

  it('editar los pares de un activo cambia la suscripción', async () => {
    assetRows.current = [asset('XRP', { binance_usdt_pair: 'XRPUSDT' })];

    await feed.syncLivePriceSubscriptions();

    expect(streamsOf(lastSocket())).toEqual(['eurusdt@miniTicker', 'xrpusdt@miniTicker']);
  });

  it('sin cambios en los pares no reconecta', async () => {
    await feed.syncLivePriceSubscriptions();
    expect(sockets).toHaveLength(1);
  });

  it('tras un cierre inesperado, la reconexión usa el conjunto de pares vigente', async () => {
    assetRows.current = [...assetRows.current, asset('ADA', { binance_eur_pair: 'ADAEUR' })];
    await feed.refreshPairIndex(); // índice actualizado sin forzar resuscripción

    sockets[0].close();            // caída de la conexión
    vi.advanceTimersByTime(5_000);

    expect(sockets).toHaveLength(2);
    expect(streamsOf(lastSocket())).toContain('adaeur@miniTicker');
  });

  it('las resincronizaciones simultáneas se agrupan', async () => {
    assetRows.current = [...assetRows.current, asset('ADA', { binance_eur_pair: 'ADAEUR' })];
    queryMock.mockClear();

    await Promise.all([
      feed.syncLivePriceSubscriptions(),
      feed.syncLivePriceSubscriptions(),
      feed.syncLivePriceSubscriptions(),
    ]);

    const indexQueries = queryMock.mock.calls.filter(([sql]) => String(sql).includes('FROM asset_metadata'));
    expect(indexQueries.length).toBeLessThanOrEqual(2);
    expect(sockets).toHaveLength(2);
  });
});
