import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Precios de cierre diario a las 00:00 Europe/Madrid (#164). Sin red ni
// Postgres reales: db, pairDetector, CoinGecko y fetch se sustituyen.

const { queryMock, pairInfoMock, coinGeckoMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  pairInfoMock: vi.fn(),
  coinGeckoMock: vi.fn(),
}));
vi.mock('../../db/client', () => ({ db: { query: queryMock } }));
vi.mock('./pairDetector', () => ({ getOrDetectPairInfo: pairInfoMock }));
vi.mock('./coingecko', () => ({ getHistoricalPriceEur: coinGeckoMock }));

function pairs(overrides: Partial<Record<'binanceEurPair' | 'binanceUsdtPair' | 'binanceBtcPair' | 'binanceEthPair', string>> = {}) {
  return {
    symbol: 'X', binanceEurPair: null, binanceUsdtPair: null, binanceBtcPair: null, binanceEthPair: null,
    priceSource: 'eur_direct', isStablecoin: false, ...overrides,
  };
}

// Respuesta de /klines con una vela cuyo cierre es `close`.
const kline = (close: string) => ({ ok: true, status: 200, headers: new Headers(), json: async () => [[0, '0', '0', '0', close]] });
const empty = { ok: true, status: 200, headers: new Headers(), json: async () => [] };
const tooMany = { ok: false, status: 429, headers: new Headers({ 'retry-after': '1' }), json: async () => ({}) };

const insertCalls = () => queryMock.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO price_close_madrid'));

describe('closePrices — instante de cierre a las 00:00 de Madrid', () => {
  let cp: typeof import('./closePrices');
  beforeEach(async () => { vi.resetModules(); cp = await import('./closePrices'); });

  it.each([
    ['2026-01-15', '2026-01-15T23:00:00.000Z'], // invierno (CET, UTC+1)
    ['2026-07-15', '2026-07-15T22:00:00.000Z'], // verano (CEST, UTC+2)
    ['2026-03-28', '2026-03-28T23:00:00.000Z'], // la medianoche siguiente aún es CET
    ['2026-03-29', '2026-03-29T22:00:00.000Z'], // día del cambio a verano
    ['2026-10-24', '2026-10-24T22:00:00.000Z'], // la medianoche siguiente aún es CEST
    ['2026-10-25', '2026-10-25T23:00:00.000Z'], // día del cambio a invierno
    ['2026-12-31', '2026-12-31T23:00:00.000Z'], // cambio de año
  ])('el cierre del día %s es %s', (day, iso) => {
    expect(cp.madridCloseInstant(day).toISOString()).toBe(iso);
  });

  it('rechaza fechas con formato inválido', () => {
    expect(() => cp.madridCloseInstant('15/01/2026')).toThrow();
  });
});

describe('closePrices — getClosePriceEur', () => {
  let cp: typeof import('./closePrices');
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    vi.resetModules();
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    pairInfoMock.mockReset();
    coinGeckoMock.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    cp = await import('./closePrices');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('EUR vale siempre 1 sin tocar red ni BD', async () => {
    expect(await cp.getClosePriceEur('EUR', '2026-01-15')).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('pide la vela horaria que cierra a las 00:00 de Madrid y guarda el resultado', async () => {
    pairInfoMock.mockResolvedValue(pairs({ binanceEurPair: 'XRPEUR' }));
    fetchMock.mockResolvedValue(kline('2.5'));

    expect(await cp.getClosePriceEur('XRP', '2026-01-15')).toBe(2.5);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('symbol')).toBe('XRPEUR');
    expect(url.searchParams.get('interval')).toBe('1h');
    // La vela abre una hora antes del cierre (23:00Z) y es la única pedida.
    expect(url.searchParams.get('startTime')).toBe(String(Date.parse('2026-01-15T22:00:00Z')));
    expect(url.searchParams.get('limit')).toBe('1');
    expect(insertCalls()).toHaveLength(1);
    expect(insertCalls()[0][1]).toEqual(['XRP', '2026-01-15', 2.5, 'binance_1h']);
  });

  it('par USDT: convierte con la vela de EURUSDT de la misma hora', async () => {
    pairInfoMock.mockResolvedValue(pairs({ binanceUsdtPair: 'HBARUSDT' }));
    fetchMock.mockImplementation(async (u: string) =>
      u.includes('symbol=HBARUSDT') ? kline('0.25') : u.includes('symbol=EURUSDT') ? kline('1.25') : empty);

    expect(await cp.getClosePriceEur('HBAR', '2026-01-15')).toBeCloseTo(0.2, 10);
  });

  it('par BTC: convierte con el cierre de BTC en EUR', async () => {
    pairInfoMock.mockImplementation(async (s: string) =>
      s === 'BTC' ? pairs({ binanceEurPair: 'BTCEUR' }) : pairs({ binanceBtcPair: 'AAABTC' }));
    fetchMock.mockImplementation(async (u: string) =>
      u.includes('symbol=AAABTC') ? kline('0.0001') : u.includes('symbol=BTCEUR') ? kline('50000') : empty);

    expect(await cp.getClosePriceEur('AAA', '2026-01-15')).toBeCloseTo(5, 10);
  });

  it('usa la caché sin pedir nada a Binance', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ price_eur: '2.4' }] });
    expect(await cp.getClosePriceEur('XRP', '2026-01-15')).toBe(2.4);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin precio en ninguna fuente: guarda la marca y no vuelve a intentarlo', async () => {
    pairInfoMock.mockResolvedValue(pairs({ binanceEurPair: 'RAROEUR' }));
    fetchMock.mockResolvedValue(empty);
    coinGeckoMock.mockResolvedValue(0);

    expect(await cp.getClosePriceEur('RARO', '2026-01-15')).toBeNull();
    expect(insertCalls()[0][1]).toEqual(['RARO', '2026-01-15', -1, 'none']);

    queryMock.mockResolvedValueOnce({ rows: [{ price_eur: '-1' }] });
    fetchMock.mockClear();
    expect(await cp.getClosePriceEur('RARO', '2026-01-15')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin par en Binance: respaldo con el precio diario de CoinGecko del día siguiente (00:00 UTC)', async () => {
    pairInfoMock.mockResolvedValue(pairs());
    coinGeckoMock.mockResolvedValue(0.01);

    expect(await cp.getClosePriceEur('NFT', '2026-01-15')).toBe(0.01);
    expect(coinGeckoMock.mock.calls[0][1].toISOString()).toBe('2026-01-16T00:00:00.000Z');
    expect(insertCalls()[0][1]).toEqual(['NFT', '2026-01-15', 0.01, 'coingecko_daily']);
  });

  it('ante 429 espera y reintenta; el fallo transitorio no deja marca de "sin precio"', async () => {
    pairInfoMock.mockResolvedValue(pairs({ binanceEurPair: 'XRPEUR' }));
    fetchMock.mockResolvedValueOnce(tooMany).mockResolvedValueOnce(kline('2.5'));

    const pending = cp.getClosePriceEur('XRP', '2026-01-15');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe(2.5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('si Binance sigue fallando, lanza error y no guarda nada', async () => {
    pairInfoMock.mockResolvedValue(pairs({ binanceEurPair: 'XRPEUR' }));
    fetchMock.mockResolvedValue({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) });

    await expect(cp.getClosePriceEur('XRP', '2026-01-15')).rejects.toThrow();
    expect(insertCalls()).toHaveLength(0);
  });

  it('un día aún no cerrado no se consulta ni se guarda', async () => {
    expect(await cp.getClosePriceEur('XRP', '2026-10-08')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(insertCalls()).toHaveLength(0);
  });
});
