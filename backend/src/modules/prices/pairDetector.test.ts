import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock('../../db/client', () => ({ db: { query: queryMock } }));

const { searchAndSaveCoinGeckoIdMock } = vi.hoisted(() => ({ searchAndSaveCoinGeckoIdMock: vi.fn() }));
vi.mock('./coingecko', () => ({ searchAndSaveCoinGeckoId: searchAndSaveCoinGeckoIdMock }));

const ok   = (price = '1') => ({ ok: true, status: 200, json: async () => ({ price }) });
const notFound = { ok: false, status: 400, json: async () => ({ code: -1121, msg: 'Invalid symbol.' }) };
const rateLimited = { ok: false, status: 429, json: async () => ({}) };
const serverError = { ok: false, status: 500, json: async () => ({}) };

describe('pairDetector — pairExists (vía autoDetectPair)', () => {
  let pd: typeof import('./pairDetector');

  beforeEach(async () => {
    vi.resetModules();
    queryMock.mockReset();
    searchAndSaveCoinGeckoIdMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    pd = await import('./pairDetector');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('marca price_source=eur_direct si el par EUR existe', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('EUR') ? ok() : notFound)));
    const info = await pd.autoDetectPair('XYZ');
    expect(info.priceSource).toBe('eur_direct');
    expect(info.binanceEurPair).toBe('XYZEUR');
  });

  it('confirmado 400 (símbolo inválido): no existe, sin reintentar', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(url); return notFound; }));
    const info = await pd.autoDetectPair('NOEXISTE');
    expect(info.priceSource).not.toBe('eur_direct');
    // 4 candidatos (EUR/USDT/BTC/ETH), una sola llamada cada uno — sin reintento tras un 400.
    expect(calls).toHaveLength(4);
  });

  it('429 (rate limit): no concluyente, reintenta y puede confirmar que SÍ existe', async () => {
    let callsForEur = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('EUR')) {
        callsForEur++;
        return callsForEur === 1 ? rateLimited : ok(); // falla una vez, luego responde bien
      }
      return notFound;
    }));
    const info = await pd.autoDetectPair('XYZ');
    expect(info.priceSource).toBe('eur_direct');
    expect(callsForEur).toBe(2); // confirmó tras reintentar, no se quedó con el 429 inicial
  });

  it('500 (servidor): no concluyente, reintenta antes de concluir ausencia', async () => {
    let callsForEur = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('EUR')) { callsForEur++; return serverError; }
      return notFound;
    }));
    const info = await pd.autoDetectPair('XYZ');
    expect(info.priceSource).not.toBe('eur_direct'); // agotados los reintentos, sin confirmación → ausente
    expect(callsForEur).toBe(2); // pero sí reintentó antes de rendirse
  });

  it('error de red (fetch lanza): no concluyente, reintenta', async () => {
    let callsForEur = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('EUR')) {
        callsForEur++;
        if (callsForEur === 1) throw new Error('network error');
        return ok();
      }
      return notFound;
    }));
    const info = await pd.autoDetectPair('XYZ');
    expect(info.priceSource).toBe('eur_direct');
    expect(callsForEur).toBe(2);
  });

  it('sin ningún par de Binance, cae a CoinGecko', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notFound));
    searchAndSaveCoinGeckoIdMock.mockResolvedValue('xyz-coin');
    const info = await pd.autoDetectPair('XYZ');
    expect(info.priceSource).toBe('coingecko');
  });

  it('sin par de Binance ni CoinGecko, queda unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notFound));
    searchAndSaveCoinGeckoIdMock.mockResolvedValue(null);
    const info = await pd.autoDetectPair('XYZ');
    expect(info.priceSource).toBe('unknown');
  });
});

describe('pairDetector — getOrDetectPairInfo', () => {
  let pd: typeof import('./pairDetector');

  beforeEach(async () => {
    vi.resetModules();
    queryMock.mockReset();
    pd = await import('./pairDetector');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('usa la caché en memoria tras loadPairCache, sin volver a consultar BD', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ symbol: 'BTC', binance_eur_pair: 'BTCEUR', binance_usdt_pair: null, binance_btc_pair: null, binance_eth_pair: null, price_source: 'eur_direct', is_stablecoin: false }],
    });
    await pd.loadPairCache();
    queryMock.mockReset();

    const info = await pd.getOrDetectPairInfo('BTC');
    expect(info.priceSource).toBe('eur_direct');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('sin caché ni fila en BD, auto-detecta contra Binance', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('EUR') ? ok() : notFound)));

    const info = await pd.getOrDetectPairInfo('XYZ');
    expect(info.priceSource).toBe('eur_direct');
  });
});

describe('pairDetector — testPair', () => {
  let pd: typeof import('./pairDetector');

  beforeEach(async () => {
    vi.resetModules();
    pd = await import('./pairDetector');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('devuelve exists:true y el precio si el par existe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('50000.5')));
    const result = await pd.testPair('BTCEUR');
    expect(result).toEqual({ exists: true, price: 50000.5 });
  });

  it('devuelve exists:false si el par no existe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notFound));
    const result = await pd.testPair('NOEXISTEEUR');
    expect(result).toEqual({ exists: false });
  });

  it('devuelve exists:false si la petición falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network error'); }));
    const result = await pd.testPair('BTCEUR');
    expect(result).toEqual({ exists: false });
  });
});

describe('pairDetector — detección sin persistir símbolos desconocidos (#146)', () => {
  let pd: typeof import('./pairDetector');

  beforeEach(async () => {
    vi.resetModules();
    queryMock.mockReset();
    searchAndSaveCoinGeckoIdMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    searchAndSaveCoinGeckoIdMock.mockResolvedValue(null);
    pd = await import('./pairDetector');
  });

  afterEach(() => vi.unstubAllGlobals());

  const insertCalls = () =>
    queryMock.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO asset_metadata'));

  it('persistUnknown:false con un símbolo sin par ni CoinGecko: no inserta en asset_metadata ni lo cachea', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notFound));
    const info = await pd.getOrDetectPairInfo('NOEXISTE', { persistUnknown: false });

    expect(info.priceSource).toBe('unknown');
    expect(insertCalls()).toHaveLength(0);
    expect(pd.getPairInfo('NOEXISTE')).toBeNull();
  });

  it('persistUnknown:false: repetir la consulta dentro del TTL no vuelve a llamar a Binance', async () => {
    const fetchMock = vi.fn(async () => notFound);
    vi.stubGlobal('fetch', fetchMock);

    await pd.getOrDetectPairInfo('NOEXISTE', { persistUnknown: false });
    const callsAfterFirst = fetchMock.mock.calls.length;
    await pd.getOrDetectPairInfo('NOEXISTE', { persistUnknown: false });

    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('persistUnknown:false con par encontrado: sí persiste (activo real)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('XYZEUR') ? ok() : notFound)));
    const info = await pd.getOrDetectPairInfo('XYZ', { persistUnknown: false });

    expect(info.priceSource).toBe('eur_direct');
    expect(insertCalls()).toHaveLength(1);
    expect(pd.getPairInfo('XYZ')).not.toBeNull();
  });

  it('por defecto (importación, transacciones) un símbolo sin par se sigue registrando', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notFound));
    await pd.getOrDetectPairInfo('NUEVO');

    expect(insertCalls()).toHaveLength(1);
  });
});
