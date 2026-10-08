import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks hoisted: db.query, pairDetector y coingecko se sustituyen por completo
// para aislar la lógica de cascada EUR>USDT>BTC>ETH>CoinGecko de getHistoricalPriceEur
// sin tocar red ni Postgres reales (igual que priceResolution.test.ts, 2º describe).
const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock('../../db/client', () => ({ db: { query: queryMock } }));

const { getOrDetectPairInfoMock, getPairInfoMock } = vi.hoisted(() => ({
  getOrDetectPairInfoMock: vi.fn(),
  getPairInfoMock: vi.fn(),
}));
vi.mock('./pairDetector', () => ({
  getOrDetectPairInfo: getOrDetectPairInfoMock,
  loadPairCache: vi.fn(),
  getPairInfo: getPairInfoMock,
}));

const { getCoinGeckoHistoricalPriceMock, getCurrentPricesEurMock, searchAndSaveCoinGeckoIdMock } = vi.hoisted(() => ({
  getCoinGeckoHistoricalPriceMock: vi.fn(),
  getCurrentPricesEurMock: vi.fn(),
  searchAndSaveCoinGeckoIdMock: vi.fn(),
}));
vi.mock('./coingecko', () => ({
  getHistoricalPriceEur: getCoinGeckoHistoricalPriceMock,
  getCurrentPricesEur: getCurrentPricesEurMock,
  searchAndSaveCoinGeckoId: searchAndSaveCoinGeckoIdMock,
}));

function pairInfo(overrides: Partial<{
  binanceEurPair: string | null; binanceUsdtPair: string | null;
  binanceBtcPair: string | null; binanceEthPair: string | null;
  priceSource: string;
}> = {}) {
  return {
    symbol: 'XYZ',
    binanceEurPair: null, binanceUsdtPair: null, binanceBtcPair: null, binanceEthPair: null,
    priceSource: 'unknown', isStablecoin: false,
    ...overrides,
  };
}

function klineResponse(closePrice: string) {
  return { ok: true, status: 200, json: async () => [[0, 0, 0, 0, closePrice]] };
}
const notFound = { ok: false, status: 404, json: async () => ({}) };

describe('binance — getHistoricalPriceEur (cascada EUR>USDT>BTC>ETH>CoinGecko)', () => {
  let bin: typeof import('./binance');

  beforeEach(async () => {
    vi.resetModules();
    queryMock.mockReset();
    getOrDetectPairInfoMock.mockReset();
    getCoinGeckoHistoricalPriceMock.mockReset();
    searchAndSaveCoinGeckoIdMock.mockReset();
    bin = await import('./binance');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('EUR siempre devuelve 1, sin tocar BD ni red', async () => {
    const price = await bin.getHistoricalPriceEur('EUR', new Date('2024-01-15'));
    expect(price).toBe(1);
    expect(queryMock).not.toHaveBeenCalled();
    expect(getOrDetectPairInfoMock).not.toHaveBeenCalled();
  });

  it('resuelve un alias (WBTC) consultando el precio cacheado de su subyacente (BTC)', async () => {
    queryMock.mockResolvedValue({ rows: [{ price_eur: '50000' }] });
    const price = await bin.getHistoricalPriceEur('WBTC', new Date('2024-01-15'));
    expect(price).toBe(50000);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('FROM price_cache'), ['BTC', '2024-01-15']);
  });

  it('devuelve el precio cacheado en DB sin llamar a pairDetector', async () => {
    queryMock.mockResolvedValue({ rows: [{ price_eur: '1.23' }] });
    const price = await bin.getHistoricalPriceEur('XRP', new Date('2024-01-15'));
    expect(price).toBe(1.23);
    expect(getOrDetectPairInfoMock).not.toHaveBeenCalled();
  });

  it('sentinela -1 en caché devuelve 0 sin llamar a pairDetector', async () => {
    queryMock.mockResolvedValue({ rows: [{ price_eur: '-1' }] });
    const price = await bin.getHistoricalPriceEur('SINPRECIO', new Date('2024-01-15'));
    expect(price).toBe(0);
    expect(getOrDetectPairInfoMock).not.toHaveBeenCalled();
  });

  it('prioriza el par EUR sobre el par USDT cuando ambos resuelven', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    getOrDetectPairInfoMock.mockResolvedValue(pairInfo({ binanceEurPair: 'XYZEUR', binanceUsdtPair: 'XYZUSDT' }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('symbol=XYZEUR'))  return klineResponse('10');
      if (url.includes('symbol=XYZUSDT')) return klineResponse('11');
      return notFound;
    }));

    const price = await bin.getHistoricalPriceEur('XYZ', new Date('2024-01-15'));
    expect(price).toBe(10);
  });

  it('usa el par USDT convertido a EUR si no hay par EUR directo', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    getOrDetectPairInfoMock.mockResolvedValue(pairInfo({ binanceUsdtPair: 'XYZUSDT' }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('symbol=XYZUSDT')) return klineResponse('11');
      if (url.includes('symbol=EURUSDT')) return klineResponse('1.1'); // 1 EUR = 1.1 USDT
      return notFound;
    }));

    const price = await bin.getHistoricalPriceEur('XYZ', new Date('2024-01-15'));
    expect(price).toBeCloseTo(10, 5); // 11 USDT / 1.1 USDT-por-EUR = 10 EUR
  });

  it('sin ningún par de Binance disponible, cae a CoinGecko', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    getOrDetectPairInfoMock.mockResolvedValue(pairInfo());
    searchAndSaveCoinGeckoIdMock.mockResolvedValue('xyz-coin');
    getCoinGeckoHistoricalPriceMock.mockResolvedValue(42);

    const price = await bin.getHistoricalPriceEur('XYZ', new Date('2024-01-15'));
    expect(price).toBe(42);
    expect(searchAndSaveCoinGeckoIdMock).toHaveBeenCalledWith('XYZ');
  });

  it('sin precio en Binance ni CoinGecko, persiste el sentinela -1 y devuelve 0', async () => {
    const inserts: unknown[][] = [];
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/SELECT price_eur FROM price_cache/.test(sql)) return { rows: [] };
      if (/^INSERT INTO price_cache/.test(sql)) { inserts.push(params ?? []); return { rows: [] }; }
      return { rows: [] };
    });
    getOrDetectPairInfoMock.mockResolvedValue(pairInfo());
    searchAndSaveCoinGeckoIdMock.mockResolvedValue(null);
    getCoinGeckoHistoricalPriceMock.mockResolvedValue(0);

    const price = await bin.getHistoricalPriceEur('XYZ', new Date('2024-01-15'));
    expect(price).toBe(0);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual(['XYZ', '2024-01-15']);
  });

  it('deduplica llamadas concurrentes para el mismo símbolo y fecha (una sola resolución)', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    getOrDetectPairInfoMock.mockResolvedValue(pairInfo({ binanceEurPair: 'XYZEUR' }));
    vi.stubGlobal('fetch', vi.fn(async () => klineResponse('5')));

    const date = new Date('2024-01-15');
    const [a, b] = await Promise.all([
      bin.getHistoricalPriceEur('XYZ', date),
      bin.getHistoricalPriceEur('XYZ', date),
    ]);

    expect(a).toBe(5);
    expect(b).toBe(5);
    expect(getOrDetectPairInfoMock).toHaveBeenCalledTimes(1);
  });
});

describe('binance — lookupHistoricalPriceEur (consulta pública sin efectos secundarios, #146)', () => {
  let bin: typeof import('./binance');

  beforeEach(async () => {
    vi.resetModules();
    queryMock.mockReset();
    getOrDetectPairInfoMock.mockReset();
    getPairInfoMock.mockReset();
    getCoinGeckoHistoricalPriceMock.mockReset();
    searchAndSaveCoinGeckoIdMock.mockReset();
    bin = await import('./binance');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('símbolo desconocido y no registrado: devuelve 0 sin escribir en price_cache', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    getOrDetectPairInfoMock.mockResolvedValue(pairInfo({ priceSource: 'unknown' }));
    getPairInfoMock.mockReturnValue(null);

    const price = await bin.lookupHistoricalPriceEur('NOEXISTE', new Date('2025-04-09'));

    expect(price).toBe(0);
    expect(getOrDetectPairInfoMock).toHaveBeenCalledWith('NOEXISTE', { persistUnknown: false });
    const writes = queryMock.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO price_cache'));
    expect(writes).toHaveLength(0);
  });

  it('activo registrado: delega en getHistoricalPriceEur', async () => {
    queryMock.mockResolvedValue({ rows: [{ price_eur: '0.5' }] });
    getOrDetectPairInfoMock.mockResolvedValue(pairInfo({ priceSource: 'eur_direct', binanceEurPair: 'XRPEUR' }));
    getPairInfoMock.mockReturnValue(pairInfo({ priceSource: 'eur_direct' }));

    const price = await bin.lookupHistoricalPriceEur('XRP', new Date('2024-01-15'));
    expect(price).toBe(0.5);
  });

  it('alias (WBTC) y EUR se resuelven sin pasar por la detección', async () => {
    queryMock.mockResolvedValue({ rows: [{ price_eur: '50000' }] });

    expect(await bin.lookupHistoricalPriceEur('WBTC', new Date('2024-01-15'))).toBe(50000);
    expect(await bin.lookupHistoricalPriceEur('EUR', new Date('2024-01-15'))).toBe(1);
    expect(getOrDetectPairInfoMock).not.toHaveBeenCalled();
  });
});

describe('binance — prefetchHistoricalPrices', () => {
  let bin: typeof import('./binance');

  beforeEach(async () => {
    vi.resetModules();
    queryMock.mockReset();
    getOrDetectPairInfoMock.mockReset();
    bin = await import('./binance');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('omite las fechas ya cacheadas y solo resuelve las que faltan', async () => {
    const resolved: string[] = [];
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/SELECT id FROM price_cache/.test(sql)) {
        // XYZ @ 2024-01-15 ya está cacheada; XYZ @ 2024-01-16 no.
        return params?.[1] === '2024-01-15' ? { rows: [{ id: 1 }] } : { rows: [] };
      }
      if (/SELECT price_eur FROM price_cache/.test(sql)) return { rows: [] };
      if (/^INSERT INTO price_cache/.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    getOrDetectPairInfoMock.mockImplementation(async (symbol: string) => {
      resolved.push(symbol);
      return pairInfo({ binanceEurPair: 'XYZEUR' });
    });
    vi.stubGlobal('fetch', vi.fn(async () => klineResponse('5')));

    await bin.prefetchHistoricalPrices([
      { symbol: 'XYZ', date: new Date('2024-01-15') }, // cacheada, no debe resolverse
      { symbol: 'XYZ', date: new Date('2024-01-16') }, // falta, debe resolverse
    ]);

    expect(resolved).toEqual(['XYZ']);
  });

  it('no hace nada si la lista está vacía', async () => {
    await bin.prefetchHistoricalPrices([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// onPriceUpdate/offPriceUpdate no tenían test propio — offPriceUpdate es
// nueva (fix de listener leak: cada conexión WebSocket a /ws/prices
// registraba un callback que nunca se eliminaba al desconectar). El array
// priceUpdateCallbacks es un detalle privado del módulo sin getter público,
// así que se verifica el contrato observable: un callback eliminado puede
// volver a eliminarse sin lanzar (splice sobre -1 es un no-op seguro), y un
// callback nunca registrado tampoco lanza al intentar eliminarlo.
describe('onPriceUpdate / offPriceUpdate', () => {
  it('offPriceUpdate es idempotente: eliminar dos veces el mismo callback no lanza', async () => {
    const bin = await import('./binance');
    const cb = () => {};

    bin.onPriceUpdate(cb);
    expect(() => bin.offPriceUpdate(cb)).not.toThrow();
    expect(() => bin.offPriceUpdate(cb)).not.toThrow();
  });

  it('offPriceUpdate sobre un callback nunca registrado no lanza', async () => {
    const bin = await import('./binance');
    expect(() => bin.offPriceUpdate(() => {})).not.toThrow();
  });
});

describe('binance — handleTickerMessage (feed en vivo sin consultas por tick, #148)', () => {
  let bin: typeof import('./binance');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [
      { symbol: 'XRP',  binance_eur_pair: 'XRPEUR', binance_usdt_pair: 'XRPUSDT', binance_btc_pair: 'XRPBTC', binance_eth_pair: null },
      { symbol: 'HBAR', binance_eur_pair: null, binance_usdt_pair: 'HBARUSDT', binance_btc_pair: null, binance_eth_pair: null },
    ] });
    bin = await import('./binance');
    await bin.refreshPairIndex();
    queryMock.mockClear();
  });

  afterEach(() => vi.useRealTimers());

  const tick = (s: string, c: string) => JSON.stringify({ stream: `${s.toLowerCase()}@miniTicker`, data: { s, c } });

  it('no consulta la base de datos al procesar mensajes', () => {
    bin.handleTickerMessage(tick('XRPEUR', '2'));
    bin.handleTickerMessage(tick('HBARUSDT', '0.2'));
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('un activo con varios pares toma el precio solo de su par preferido', () => {
    bin.handleTickerMessage(tick('XRPEUR', '2'));
    bin.handleTickerMessage(tick('XRPUSDT', '2.5'));
    bin.handleTickerMessage(tick('XRPBTC', '0.00004'));
    expect(bin.getLivePrice('XRP')).toBe(2);
  });

  it('convierte los pares USDT con el último EURUSDT recibido', () => {
    bin.handleTickerMessage(tick('EURUSDT', '1.25'));
    bin.handleTickerMessage(tick('HBARUSDT', '0.2'));
    expect(bin.getLivePrice('HBAR')).toBeCloseTo(0.16, 10);
  });

  it('agrupa la difusión: una emisión con solo los precios modificados', () => {
    const listener = vi.fn();
    bin.onPriceUpdate(listener);

    bin.handleTickerMessage(tick('XRPEUR', '2'));
    vi.advanceTimersByTime(0);
    bin.handleTickerMessage(tick('XRPEUR', '2.1'));
    bin.handleTickerMessage(tick('XRPEUR', '2.2'));
    bin.handleTickerMessage(tick('XRPEUR', '2.2'));
    vi.advanceTimersByTime(1000);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(new Map([['XRP', 2.2]]));
    bin.offPriceUpdate(listener);
  });

  it('ignora mensajes mal formados sin lanzar', () => {
    expect(() => bin.handleTickerMessage('no es json')).not.toThrow();
    expect(() => bin.handleTickerMessage(JSON.stringify({ data: { s: 'XRPEUR', c: 'abc' } }))).not.toThrow();
    expect(bin.getLivePrice('XRP')).toBeNull();
  });
});

describe('binance — handleTickerMessage: precio de hace 24h (campo o, #147)', () => {
  let bin: typeof import('./binance');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [
      { symbol: 'XRP',  binance_eur_pair: 'XRPEUR', binance_usdt_pair: null, binance_btc_pair: null, binance_eth_pair: null },
      { symbol: 'HBAR', binance_eur_pair: null, binance_usdt_pair: 'HBARUSDT', binance_btc_pair: null, binance_eth_pair: null },
    ] });
    bin = await import('./binance');
    await bin.refreshPairIndex();
  });

  afterEach(() => vi.useRealTimers());

  const tick = (s: string, c: string, o: string) => JSON.stringify({ data: { s, c, o } });

  it('guarda el precio de apertura de 24h en EUR, separado del precio actual', () => {
    bin.handleTickerMessage(tick('XRPEUR', '2.2', '2'));
    expect(bin.getLivePrice('XRP')).toBe(2.2);
    expect(bin.getAllOpen24Prices().get('XRP')).toBe(2);
  });

  it('convierte la apertura de los pares USDT con la apertura de EURUSDT (misma ventana)', () => {
    bin.handleTickerMessage(tick('EURUSDT', '1.25', '1.1'));
    bin.handleTickerMessage(tick('HBARUSDT', '0.25', '0.22'));
    expect(bin.getLivePrice('HBAR')).toBeCloseTo(0.2, 10);                 // 0.25 / 1.25
    expect(bin.getAllOpen24Prices().get('HBAR')).toBeCloseTo(0.2, 10);     // 0.22 / 1.1
  });

  it('sin apertura de EURUSDT todavía no inventa la apertura de un par USDT', () => {
    bin.handleTickerMessage(tick('HBARUSDT', '0.25', '0.22'));
    expect(bin.getAllOpen24Prices().has('HBAR')).toBe(false);
  });

  it('difunde los cambios de apertura por su propio canal', () => {
    const listener = vi.fn();
    bin.onOpen24Update(listener);
    bin.handleTickerMessage(tick('XRPEUR', '2.2', '2'));
    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledWith(new Map([['XRP', 2]]));
    bin.offOpen24Update(listener);
  });
});

