import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks hoisted: db.query, pairDetector y coingecko se sustituyen por completo
// para aislar la lógica de cascada EUR>USDT>BTC>ETH>CoinGecko de getHistoricalPriceEur
// sin tocar red ni Postgres reales (igual que priceResolution.test.ts, 2º describe).
const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock('../../db/client', () => ({ db: { query: queryMock } }));

const { getOrDetectPairInfoMock } = vi.hoisted(() => ({ getOrDetectPairInfoMock: vi.fn() }));
vi.mock('./pairDetector', () => ({
  getOrDetectPairInfo: getOrDetectPairInfoMock,
  loadPairCache: vi.fn(),
  getPairInfo: vi.fn(),
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
