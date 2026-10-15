import { getOrDetectPairInfo } from './pairDetector';
import { fetchKlines } from './closePrices';
import { EURUSDT_PAIR } from './livePairIndex';

// Precios en EUR cada 15 minutos de las últimas horas (#215), base de la serie
// intradía (24H) del gráfico de evolución. Misma cascada de pares que los
// cierres diarios: EUR > USDT (con EURUSDT) > BTC > ETH (con su serie en EUR).
//
// Cada serie se indexa por el instante de cierre de la vela (apertura + 15
// min). Las series por par se guardan 5 minutos en memoria y las peticiones
// simultáneas del mismo par se comparten, para no repetir llamadas a Binance
// en cada consulta del gráfico.

export const QUARTER_MS = 15 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CANDLES = 200;

export type PriceSeries = Map<number, number>;

interface CachedSeries { fetchedAt: number; fromMs: number; series: PriceSeries }
const pairCache = new Map<string, CachedSeries>();
const inFlight = new Map<string, Promise<PriceSeries>>();

/** Solo para tests: vacía la caché de series. */
export function clearIntradayCache(): void {
  pairCache.clear();
  inFlight.clear();
}

async function pairSeries(pair: string, fromMs: number, now: number): Promise<PriceSeries> {
  const cached = pairCache.get(pair);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS && cached.fromMs <= fromMs) return cached.series;
  const pending = inFlight.get(pair);
  if (pending) return pending;

  const work = (async () => {
    const rows = await fetchKlines(pair, '15m', fromMs - QUARTER_MS, MAX_CANDLES);
    const series: PriceSeries = new Map();
    for (const row of rows) {
      const close = parseFloat(String(row[4]));
      if (close > 0) series.set(Number(row[0]) + QUARTER_MS, close);
    }
    pairCache.set(pair, { fetchedAt: now, fromMs, series });
    return series;
  })().finally(() => inFlight.delete(pair));
  inFlight.set(pair, work);
  return work;
}

/** Combina dos series en los instantes que tienen ambas. */
function combine(a: PriceSeries, b: PriceSeries, op: (x: number, y: number) => number): PriceSeries {
  const out: PriceSeries = new Map();
  for (const [t, x] of a) {
    const y = b.get(t);
    if (y !== undefined && y > 0) out.set(t, op(x, y));
  }
  return out;
}

/**
 * Precios en EUR de `asset` cada 15 min desde `fromMs`. null si el activo no
 * tiene par en Binance o la descarga falla (el llamador usa el precio en vivo).
 */
export async function quarterHourPricesEur(asset: string, fromMs: number, now = Date.now()): Promise<PriceSeries | null> {
  try {
    if (asset === 'USDT') {
      const eurusdt = await pairSeries(EURUSDT_PAIR, fromMs, now);
      return new Map([...eurusdt].map(([t, p]) => [t, 1 / p]));
    }
    const info = await getOrDetectPairInfo(asset);
    if (info.binanceEurPair) {
      const s = await pairSeries(info.binanceEurPair, fromMs, now);
      if (s.size > 0) return s;
    }
    if (info.binanceUsdtPair) {
      const [s, eurusdt] = await Promise.all([pairSeries(info.binanceUsdtPair, fromMs, now), pairSeries(EURUSDT_PAIR, fromMs, now)]);
      const out = combine(s, eurusdt, (p, e) => p / e);
      if (out.size > 0) return out;
    }
    for (const [pair, ref] of [[info.binanceBtcPair, 'BTC'], [info.binanceEthPair, 'ETH']] as const) {
      if (!pair) continue;
      const [s, refEur] = await Promise.all([pairSeries(pair, fromMs, now), quarterHourPricesEur(ref, fromMs, now)]);
      if (refEur) {
        const out = combine(s, refEur, (p, r) => p * r);
        if (out.size > 0) return out;
      }
    }
    return null;
  } catch (e) {
    console.warn(`[PNL] Serie de 15 min de ${asset} no disponible:`, (e as Error).message);
    return null;
  }
}
