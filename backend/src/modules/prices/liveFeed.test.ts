import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Suscripciones dinámicas del feed en vivo (#149): sin red ni Postgres reales.
// El WebSocket de Binance se sustituye por un doble que registra la URL de
// cada conexión y permite simular cierres.

interface FakeSocket {
  url: string;
  closed: boolean;
  terminated: boolean;
  pings: number;
  handlers: Record<string, (...args: unknown[]) => void>;
  close(): void;
  terminate(): void;
  ping(): void;
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
    terminated = false;
    pings = 0;
    handlers: Record<string, (...args: unknown[]) => void> = {};
    constructor(url: string) {
      this.url = url;
      sockets.push(this as unknown as FakeSocket);
    }
    on(event: string, cb: (...args: unknown[]) => void) { this.handlers[event] = cb; return this; }
    close() { this.closed = true; this.handlers.close?.(); }
    terminate() { this.terminated = true; this.closed = true; this.handlers.close?.(); }
    ping() { this.pings++; }
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
      json: async () => [
        { symbol: 'EURUSDT', lastPrice: '1.25', openPrice: '1.1' },
        { symbol: 'HBARUSDT', lastPrice: '0.2', openPrice: '0.22' },
      ],
    })));
    assetRows.current = [...assetRows.current, asset('HBAR', { binance_usdt_pair: 'HBARUSDT' })];

    await feed.syncLivePriceSubscriptions();

    expect(feed.getLivePrice('HBAR')).toBeCloseTo(0.16, 10);          // 0.2 / 1.25
    expect(feed.getAllOpen24Prices().get('HBAR')).toBeCloseTo(0.2, 10); // 0.22 / 1.1 (#147)
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

// Conexión «zombi» (#194): el socket sigue abierto pero deja de entregar datos.
// Sin vigilancia, el feed quedaba congelado hasta reiniciar el backend.
describe('liveFeed — vigilancia de inactividad (#194)', () => {
  let feed: typeof import('./liveFeed');
  const tick = (socket: FakeSocket, price = '1.2') =>
    socket.handlers.message?.(Buffer.from(JSON.stringify({ data: { s: 'XRPEUR', c: price, o: '1.1' } })));

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    sockets.length = 0;
    assetRows.current = [asset('XRP', { binance_eur_pair: 'XRPEUR' })];
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) =>
      String(sql).includes('FROM asset_metadata') ? { rows: assetRows.current } : { rows: [] });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    feed = await import('./liveFeed');
    feed.startLivePrices();
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].handlers.open?.();
  });

  afterEach(() => {
    feed.stopLivePrices();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('una conexión sin mensajes ni pong durante 60 s se termina y se reconecta', () => {
    vi.advanceTimersByTime(59_000);
    expect(sockets[0].terminated).toBe(false);

    // Se comprueba en cada latido (20 s): peor caso, 60 s de inactividad + un latido.
    vi.advanceTimersByTime(21_000);
    expect(sockets[0].terminated).toBe(true);

    vi.advanceTimersByTime(5_000);
    expect(sockets).toHaveLength(2);
  });

  it('los mensajes mantienen viva la conexión', () => {
    for (let i = 0; i < 12; i++) { vi.advanceTimersByTime(10_000); tick(sockets[0], String(1.2 + i / 100)); }
    expect(sockets[0].terminated).toBe(false);
    expect(sockets).toHaveLength(1);
  });

  it('un pong también cuenta como actividad: sirve en mercados sin cambios de precio', () => {
    for (let i = 0; i < 6; i++) { vi.advanceTimersByTime(20_000); sockets[0].handlers.pong?.(); }
    expect(sockets[0].terminated).toBe(false);
  });

  it('envía un ping periódico a Binance', () => {
    vi.advanceTimersByTime(45_000);
    expect(sockets[0].pings).toBeGreaterThanOrEqual(2);
  });

  it('los reintentos sin datos esperan cada vez más (5, 10, 20 s…) y vuelven a 5 s tras recibir datos', () => {
    sockets[0].close();
    vi.advanceTimersByTime(5_000);
    expect(sockets).toHaveLength(2);

    sockets[1].close();                 // falla sin haber recibido nada
    vi.advanceTimersByTime(9_000);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(3);

    sockets[2].handlers.open?.();
    tick(sockets[2]);                   // la conexión funciona: se reinicia la espera
    sockets[2].close();
    vi.advanceTimersByTime(5_000);
    expect(sockets).toHaveLength(4);
  });

  it('expone cuándo llegó el último dato del feed', () => {
    expect(feed.getFeedStatus().lastTickAt).toBeNull();
    vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    tick(sockets[0]);
    expect(feed.getFeedStatus().lastTickAt).toBe(Date.parse('2026-10-14T10:00:00Z'));
  });
});
