import { beforeEach, describe, expect, it, vi } from 'vitest';

// Precios de 15 min para la serie intradía (#215).
const { klinesMock, pairInfoMock } = vi.hoisted(() => ({ klinesMock: vi.fn(), pairInfoMock: vi.fn() }));
vi.mock('./closePrices', () => ({ fetchKlines: klinesMock }));
vi.mock('./pairDetector', () => ({ getOrDetectPairInfo: pairInfoMock }));

const { quarterHourPricesEur, clearIntradayCache, QUARTER_MS } = await import('./intradayPrices');

const T0 = Date.UTC(2026, 9, 15, 10, 0);
/** Velas [apertura, …, cierre] con cierre en los instantes T0 y T0+15 min. */
const candles = (c1: number, c2: number) => [[T0 - QUARTER_MS, '0', '0', '0', String(c1)], [T0, '0', '0', '0', String(c2)]];
const info = (p: Partial<Record<'binanceEurPair' | 'binanceUsdtPair' | 'binanceBtcPair' | 'binanceEthPair', string | null>>) =>
  ({ binanceEurPair: null, binanceUsdtPair: null, binanceBtcPair: null, binanceEthPair: null, ...p });

beforeEach(() => { clearIntradayCache(); klinesMock.mockReset(); pairInfoMock.mockReset(); });

describe('quarterHourPricesEur', () => {
  it('par EUR directo, indexado por el cierre de cada vela', async () => {
    pairInfoMock.mockResolvedValue(info({ binanceEurPair: 'BTCEUR' }));
    klinesMock.mockResolvedValue(candles(100, 101));
    const s = await quarterHourPricesEur('BTC', T0, T0 + QUARTER_MS);
    expect([...s!]).toEqual([[T0, 100], [T0 + QUARTER_MS, 101]]);
    expect(klinesMock).toHaveBeenCalledWith('BTCEUR', '15m', T0 - QUARTER_MS, 200);
  });

  it('par USDT convertido con EURUSDT del mismo instante; USDT es el inverso de EURUSDT', async () => {
    pairInfoMock.mockResolvedValue(info({ binanceUsdtPair: 'XRPUSDT' }));
    klinesMock.mockImplementation(async (pair: string) => (pair === 'EURUSDT' ? candles(1.25, 1.25) : candles(2.5, 5)));
    expect([...(await quarterHourPricesEur('XRP', T0, T0))!]).toEqual([[T0, 2], [T0 + QUARTER_MS, 4]]);
    expect((await quarterHourPricesEur('USDT', T0, T0))!.get(T0)).toBeCloseTo(0.8);
  });

  it('reutiliza la serie en caché durante 5 minutos', async () => {
    pairInfoMock.mockResolvedValue(info({ binanceEurPair: 'BTCEUR' }));
    klinesMock.mockResolvedValue(candles(100, 101));
    await quarterHourPricesEur('BTC', T0, T0);
    await quarterHourPricesEur('BTC', T0, T0 + 60_000);
    expect(klinesMock).toHaveBeenCalledTimes(1);
    await quarterHourPricesEur('BTC', T0, T0 + 6 * 60_000);
    expect(klinesMock).toHaveBeenCalledTimes(2);
  });

  it('sin par en Binance o con la descarga fallida devuelve null', async () => {
    pairInfoMock.mockResolvedValue(info({}));
    expect(await quarterHourPricesEur('RARO', T0, T0)).toBeNull();
    pairInfoMock.mockResolvedValue(info({ binanceEurPair: 'BTCEUR' }));
    klinesMock.mockRejectedValue(new Error('HTTP 500'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await quarterHourPricesEur('BTC', T0, T0)).toBeNull();
  });
});
