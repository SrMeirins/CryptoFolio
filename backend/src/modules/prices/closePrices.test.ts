import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Precios de cierre diario a las 00:00 locales de cada zona (#164, #389). Sin
// red ni Postgres reales: db, pairDetector, CoinGecko y fetch se sustituyen.
const MAD = 'Europe/Madrid';
const CAN = 'Atlantic/Canary';

const { queryMock, pairInfoMock, coinGeckoMock, marketChartMock, respaldoMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  pairInfoMock: vi.fn(),
  coinGeckoMock: vi.fn(),
  marketChartMock: vi.fn(),
  respaldoMock: vi.fn(async () => null),
}));
vi.mock('../../db/client', () => ({ db: { query: queryMock } }));
vi.mock('./pairDetector', () => ({ getOrDetectPairInfo: pairInfoMock }));
vi.mock('./coingecko', () => ({ getHistoricalPriceEur: coinGeckoMock, fetchMarketChart: marketChartMock }));
// Fuentes de respaldo (#337): sin dato por defecto; cada test decide.
vi.mock('./respaldo/cascada', () => ({ precioDiaRespaldo: respaldoMock }));

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

const insertCalls = () => queryMock.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO price_close_daily'));

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
    expect(cp.closeInstant(MAD, day).toISOString()).toBe(iso);
  });

  it('rechaza fechas con formato inválido', () => {
    expect(() => cp.closeInstant(MAD, '15/01/2026')).toThrow();
  });
});

describe('closePrices — día local de Madrid de un instante', () => {
  let cp: typeof import('./closePrices');
  beforeEach(async () => { vi.resetModules(); cp = await import('./closePrices'); });

  it.each([
    ['2026-01-15T22:59:59.999Z', '2026-01-15'], // 23:59:59 CET
    ['2026-01-15T23:00:00.000Z', '2026-01-16'], // 00:00 CET del día siguiente
    ['2026-07-15T21:59:59.999Z', '2026-07-15'], // 23:59:59 CEST
    ['2026-07-15T22:00:00.000Z', '2026-07-16'], // 00:00 CEST del día siguiente
    ['2026-03-29T01:30:00.000Z', '2026-03-29'], // tras el cambio a verano
    ['2026-10-25T00:30:00.000Z', '2026-10-25'], // hora repetida del cambio a invierno
    ['2026-12-31T23:00:00.000Z', '2027-01-01'], // cambio de año
  ])('el instante %s es el día %s', (iso, day) => {
    expect(cp.localDateOf(MAD, Date.parse(iso))).toBe(day);
  });

  it('es la inversa del cierre: el instante de cierre de un día ya pertenece al día siguiente', () => {
    for (const day of ['2026-03-28', '2026-03-29', '2026-10-24', '2026-10-25']) {
      const close = cp.closeInstant(MAD, day).getTime();
      expect(cp.localDateOf(MAD, close - 1)).toBe(day);
      expect(cp.localDateOf(MAD, close)).not.toBe(day);
    }
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
    expect(await cp.getClosePriceEur('EUR', '2026-01-15', MAD)).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('pide la vela horaria que cierra a las 00:00 de Madrid y guarda el resultado', async () => {
    pairInfoMock.mockResolvedValue(pairs({ binanceEurPair: 'XRPEUR' }));
    fetchMock.mockResolvedValue(kline('2.5'));

    expect(await cp.getClosePriceEur('XRP', '2026-01-15', MAD)).toBe(2.5);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('symbol')).toBe('XRPEUR');
    expect(url.searchParams.get('interval')).toBe('1h');
    // La vela abre una hora antes del cierre (23:00Z) y es la única pedida.
    expect(url.searchParams.get('startTime')).toBe(String(Date.parse('2026-01-15T22:00:00Z')));
    expect(url.searchParams.get('limit')).toBe('1');
    expect(insertCalls()).toHaveLength(1);
    expect(insertCalls()[0][1]).toEqual(['XRP', MAD, '2026-01-15', 2.5, 'binance_1h']);
  });

  it('par USDT: convierte con la vela de EURUSDT de la misma hora', async () => {
    pairInfoMock.mockResolvedValue(pairs({ binanceUsdtPair: 'HBARUSDT' }));
    fetchMock.mockImplementation(async (u: string) =>
      u.includes('symbol=HBARUSDT') ? kline('0.25') : u.includes('symbol=EURUSDT') ? kline('1.25') : empty);

    expect(await cp.getClosePriceEur('HBAR', '2026-01-15', MAD)).toBeCloseTo(0.2, 10);
  });

  it('par BTC: convierte con el cierre de BTC en EUR', async () => {
    pairInfoMock.mockImplementation(async (s: string) =>
      s === 'BTC' ? pairs({ binanceEurPair: 'BTCEUR' }) : pairs({ binanceBtcPair: 'AAABTC' }));
    fetchMock.mockImplementation(async (u: string) =>
      u.includes('symbol=AAABTC') ? kline('0.0001') : u.includes('symbol=BTCEUR') ? kline('50000') : empty);

    expect(await cp.getClosePriceEur('AAA', '2026-01-15', MAD)).toBeCloseTo(5, 10);
  });

  it('USDT: precio en EUR como inverso de EURUSDT (no existe par USDTEUR)', async () => {
    fetchMock.mockImplementation(async (u: string) => (u.includes('symbol=EURUSDT') ? kline('1.25') : empty));
    expect(await cp.getClosePriceEur('USDT', '2026-01-15', MAD)).toBeCloseTo(0.8, 10);
    expect(pairInfoMock).not.toHaveBeenCalled();
  });

  it('usa la caché sin pedir nada a Binance', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ price_eur: '2.4' }] });
    expect(await cp.getClosePriceEur('XRP', '2026-01-15', MAD)).toBe(2.4);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si Binance y CoinGecko no lo tienen, usa el respaldo con el precio de las 00:00 UTC siguientes (#337)', async () => {
    pairInfoMock.mockResolvedValue(pairs());
    coinGeckoMock.mockResolvedValue(0);
    respaldoMock.mockResolvedValueOnce({ precio: 0.0000002, fuente: 'okx' });

    expect(await cp.getClosePriceEur('NFT', '2023-04-12', MAD)).toBe(0.0000002);
    expect(respaldoMock).toHaveBeenCalledWith('NFT', '2023-04-13', expect.any(Function));
    expect(insertCalls()[0][1]).toEqual(['NFT', MAD, '2023-04-12', 0.0000002, 'okx_1d']);
  });

  it('un fallo de red del respaldo no deja marca de «sin precio» (#337)', async () => {
    pairInfoMock.mockResolvedValue(pairs());
    coinGeckoMock.mockResolvedValue(0);
    respaldoMock.mockRejectedValueOnce(new Error('OKX HTTP 503'));
    await expect(cp.getClosePriceEur('NFT', '2023-04-12', MAD)).rejects.toThrow('OKX HTTP 503');
    expect(insertCalls()).toHaveLength(0);
  });

  it('sin precio en ninguna fuente: guarda la marca y no vuelve a intentarlo', async () => {
    pairInfoMock.mockResolvedValue(pairs({ binanceEurPair: 'RAROEUR' }));
    fetchMock.mockResolvedValue(empty);
    coinGeckoMock.mockResolvedValue(0);

    expect(await cp.getClosePriceEur('RARO', '2026-01-15', MAD)).toBeNull();
    expect(insertCalls()[0][1]).toEqual(['RARO', MAD, '2026-01-15', -1, 'none']);

    queryMock.mockResolvedValueOnce({ rows: [{ price_eur: '-1' }] });
    fetchMock.mockClear();
    expect(await cp.getClosePriceEur('RARO', '2026-01-15', MAD)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin par en Binance: respaldo con el precio diario de CoinGecko del día siguiente (00:00 UTC)', async () => {
    pairInfoMock.mockResolvedValue(pairs());
    coinGeckoMock.mockResolvedValue(0.01);

    expect(await cp.getClosePriceEur('NFT', '2026-01-15', MAD)).toBe(0.01);
    expect(coinGeckoMock.mock.calls[0][1].toISOString()).toBe('2026-01-16T00:00:00.000Z');
    expect(insertCalls()[0][1]).toEqual(['NFT', MAD, '2026-01-15', 0.01, 'coingecko_daily']);
  });

  it('ante 429 espera y reintenta; el fallo transitorio no deja marca de "sin precio"', async () => {
    pairInfoMock.mockResolvedValue(pairs({ binanceEurPair: 'XRPEUR' }));
    fetchMock.mockResolvedValueOnce(tooMany).mockResolvedValueOnce(kline('2.5'));

    const pending = cp.getClosePriceEur('XRP', '2026-01-15', MAD);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe(2.5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('si Binance sigue fallando, lanza error y no guarda nada', async () => {
    pairInfoMock.mockResolvedValue(pairs({ binanceEurPair: 'XRPEUR' }));
    fetchMock.mockResolvedValue({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) });

    await expect(cp.getClosePriceEur('XRP', '2026-01-15', MAD)).rejects.toThrow();
    expect(insertCalls()).toHaveLength(0);
  });

  it('un día aún no cerrado no se consulta ni se guarda', async () => {
    expect(await cp.getClosePriceEur('XRP', '2026-10-08', MAD)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(insertCalls()).toHaveLength(0);
  });
});

describe('closePrices — límite de histórico de CoinGecko y precarga por rangos', () => {
  let cp: typeof import('./closePrices');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    vi.resetModules();
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    pairInfoMock.mockReset();
    coinGeckoMock.mockReset();
    marketChartMock.mockReset();
    vi.stubGlobal('fetch', vi.fn(async () => empty));
    cp = await import('./closePrices');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('un día de hace más de un año sin par en Binance no consulta CoinGecko y queda sin precio', async () => {
    pairInfoMock.mockResolvedValue(pairs());
    expect(await cp.getClosePriceEur('NFT', '2023-04-12', MAD)).toBeNull();
    expect(coinGeckoMock).not.toHaveBeenCalled();
    expect(insertCalls()[0][1]).toEqual(['NFT', MAD, '2023-04-12', -1, 'none']);
  });

  it('prefetchCloseRange sin par en Binance usa la serie de CoinGecko y marca lo que queda fuera de plazo', async () => {
    pairInfoMock.mockResolvedValue(pairs());
    marketChartMock.mockResolvedValue(new Map([['2026-09-02', 0.01]]));

    await cp.prefetchCloseRange('NFT', '2025-01-01', '2025-01-01', MAD);   // fuera de plazo
    await cp.prefetchCloseRange('NFT', '2026-09-01', '2026-09-01', MAD);   // dentro: precio del día siguiente

    const bulk = queryMock.mock.calls.filter(([sql]) => String(sql).includes('unnest'));
    expect(bulk.some(([sql, params]) => String(sql).includes("'none'") && params[1].includes('2025-01-01'))).toBe(true);
    expect(bulk.some(([sql, params]) => String(sql).includes("'coingecko_daily'") && params[1].includes('2026-09-01') && params[2][0] === 0.01)).toBe(true);
    expect(coinGeckoMock).not.toHaveBeenCalled();   // sin peticiones día a día
  });
});

describe('closePrices: cierres por zona horaria (#389)', () => {
  let cp: typeof import('./closePrices');
  beforeEach(async () => {
    vi.resetModules();
    cp = await import('./closePrices');
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
  });

  it('el instante de cierre es la medianoche local de cada zona', () => {
    expect(cp.closeInstant(CAN, '2026-01-15').toISOString()).toBe('2026-01-16T00:00:00.000Z'); // invierno, UTC+0
    expect(cp.closeInstant(CAN, '2026-07-15').toISOString()).toBe('2026-07-15T23:00:00.000Z'); // verano, UTC+1
    expect(cp.closeInstant('UTC', '2026-07-15').toISOString()).toBe('2026-07-16T00:00:00.000Z');
    expect(cp.localDateOf(CAN, Date.parse('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
    expect(cp.localDateOf(MAD, Date.parse('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });

  it('la caché distingue la zona: lee y guarda con la zona pedida y la vela de su medianoche', async () => {
    const fetchMock = vi.fn(async () => kline('2.5'));
    vi.stubGlobal('fetch', fetchMock);
    pairInfoMock.mockResolvedValue(pairs({ binanceEurPair: 'XRPEUR' }));
    expect(await cp.getClosePriceEur('XRP', '2026-01-15', CAN)).toBe(2.5);
    const select = queryMock.mock.calls.find(([sql]) => String(sql).includes('SELECT price_eur FROM price_close_daily'));
    expect(select?.[1]).toEqual(['XRP', CAN, '2026-01-15']);
    expect(insertCalls()[0][1]).toEqual(['XRP', CAN, '2026-01-15', 2.5, 'binance_1h']);
    // La vela abre una hora antes de la medianoche de Canarias (00:00Z en invierno).
    expect(new URL(String((fetchMock.mock.calls as unknown as string[][])[0][0])).searchParams.get('startTime')).toBe(String(Date.parse('2026-01-15T23:00:00Z')));
    vi.unstubAllGlobals();
  });

  it('getCachedCloses filtra por zona', async () => {
    await cp.getCachedCloses(['XRP'], '2026-01-01', '2026-01-31', CAN);
    const [sql, params] = queryMock.mock.calls[0];
    expect(String(sql)).toContain('timezone = $4');
    expect(params).toEqual([['XRP'], '2026-01-01', '2026-01-31', CAN]);
  });
});
