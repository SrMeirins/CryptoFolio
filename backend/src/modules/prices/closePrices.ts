import { db } from '../../db/client';
import { getOrDetectPairInfo } from './pairDetector';
import { getHistoricalPriceEur as getCoinGeckoDailyPriceEur, fetchMarketChart } from './coingecko';
import { fetchWithTimeout } from './httpTimeout';
import { dedupeByKey } from './priceDedup';
import { PRICE_ALIASES } from './priceAliases';

// Precio de cierre de cada día a las 00:00 Europe/Madrid (#164), base del
// P&L diario (#154). El cierre del día D es el precio en el instante en que
// empieza D+1 en Madrid (22:00 o 23:00 UTC de D según el horario).
//
// Fuentes, en orden:
// 1. Vela horaria de Binance que termina en ese instante, con la cascada de
//    pares EUR > USDT > BTC > ETH. USDT se convierte con la vela de EURUSDT
//    de la misma hora; BTC/ETH, con su propio cierre en EUR.
// 2. Respaldo CoinGecko: precio diario (00:00 UTC) de D+1, el más cercano a
//    la medianoche de Madrid (1-2 h de diferencia).
// Se guarda en price_close_madrid una sola vez por (activo, día). Sin precio
// en ninguna fuente se guarda la marca -1 para no reintentar. Los fallos
// transitorios (red, 5xx, 429 agotados) lanzan error y no dejan marca.

const REST_BASE = 'https://api.binance.com/api/v3';
const TIMEZONE = 'Europe/Madrid';
const HOUR_MS = 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_429_RETRIES = 3;
const DAY_MS = 24 * HOUR_MS;
const EURUSDT_PAIR = 'EURUSDT';

// La API pública de CoinGecko solo sirve histórico del último año: más allá
// responde HTTP 401 (observado con /coins/{id}/history). Fuera de ese plazo no
// se consulta y el día queda marcado como sin precio, en vez de reintentarlo
// indefinidamente.
const COINGECKO_HISTORY_DAYS = 365;

function withinCoinGeckoHistory(day: string): boolean {
  return Date.parse(`${nextDay(day)}T00:00:00Z`) > Date.now() - (COINGECKO_HISTORY_DAYS - 1) * DAY_MS;
}

export type CloseSource = 'binance_1h' | 'coingecko_daily' | 'none';

// ── Fechas ─────────────────────────────────────────────────────────────────

function parseDay(day: string): { y: number; m: number; d: number } {
  if (!DAY_RE.test(day)) throw new Error(`Fecha inválida: ${day} (se espera YYYY-MM-DD)`);
  const [y, m, d] = day.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Fecha inexistente: ${day}`);
  }
  return { y, m, d };
}

// Minutos que la hora de Madrid adelanta a UTC en un instante dado (60 o 120).
function madridOffsetMinutes(instantMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instantMs) / 60_000);
}

// Instante UTC en que empieza el día local `day` en Madrid. La medianoche
// nunca cae en el salto horario (que ocurre a las 02:00/03:00), así que el
// desfase es único; se recalcula una vez para afinar alrededor del cambio.
function madridMidnightMs(day: string): number {
  const { y, m, d } = parseDay(day);
  const naive = Date.UTC(y, m - 1, d);
  const guess = naive - madridOffsetMinutes(naive) * 60_000;
  return naive - madridOffsetMinutes(guess) * 60_000;
}

function nextDay(day: string): string {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Instante de cierre del día local `day`: las 00:00 de Madrid del día siguiente. */
export function madridCloseInstant(day: string): Date {
  return new Date(madridMidnightMs(nextDay(day)));
}

/** Día local (YYYY-MM-DD) en Madrid de un instante. */
export function madridDateOf(instantMs: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Días locales consecutivos de `from` a `to`, ambos incluidos. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = nextDay(d)) out.push(d);
  return out;
}

export { nextDay };

// ── Binance: vela horaria que termina en el instante de cierre ─────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Velas de 1 h de Binance (hasta 1000 por petición). [] si el par no existe;
// espera y reintenta ante 429; lanza error ante otros fallos.
async function fetchHourlyKlines(pair: string, startMs: number, limit: number, endMs?: number): Promise<unknown[][]> {
  const end = endMs !== undefined ? `&endTime=${endMs}` : '';
  const url = `${REST_BASE}/klines?symbol=${encodeURIComponent(pair)}&interval=1h&startTime=${startMs}${end}&limit=${limit}`;
  for (let attempt = 1; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetchWithTimeout(url);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10);
      await sleep(retryAfter > 0 ? retryAfter * 1000 : attempt * 10_000);
      continue;
    }
    if (res.status === 400) return []; // par inexistente
    if (!res.ok) throw new Error(`Binance klines HTTP ${res.status} para ${pair}`);
    const data = await res.json() as unknown[][];
    return Array.isArray(data) ? data : [];
  }
  throw new Error(`Binance klines: reintentos agotados por rate limit para ${pair}`);
}

// Cierre de la vela de 1 h que abre una hora antes de `closeMs`. null si
// Binance no tiene vela (par inexistente en esa fecha).
async function hourlyClose(pair: string, closeMs: number): Promise<number | null> {
  const data = await fetchHourlyKlines(pair, closeMs - HOUR_MS, 1);
  if (data.length === 0) return null;
  const close = parseFloat(String(data[0][4]));
  return close > 0 ? close : null;
}

// Cierres a las 00:00 de Madrid de una lista de días a partir de una serie de
// velas horarias, pidiendo bloques de hasta 1000 h (~41 días) por petición.
async function hourlyClosesForDays(pair: string, days: readonly string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (days.length === 0) return result;
  const wanted = new Map(days.map(d => [madridCloseInstant(d).getTime() - HOUR_MS, d])); // apertura de la vela → día
  const opens = [...wanted.keys()].sort((a, b) => a - b);
  let cursor = opens[0];
  const last = opens[opens.length - 1];

  while (cursor <= last) {
    const batch = await fetchHourlyKlines(pair, cursor, 1000, last + HOUR_MS);
    if (batch.length === 0) break;
    for (const row of batch) {
      const day = wanted.get(Number(row[0]));
      const close = parseFloat(String(row[4]));
      if (day && close > 0) result.set(day, close);
    }
    const nextCursor = Number(batch[batch.length - 1][0]) + HOUR_MS;
    if (nextCursor <= cursor || batch.length < 1000) break;
    cursor = nextCursor;
  }
  return result;
}

async function binanceClose(asset: string, day: string, closeMs: number): Promise<number | null> {
  // USDT no tiene par USDTEUR: su precio en EUR es el inverso de EURUSDT.
  if (asset === 'USDT') {
    const eurusdt = await hourlyClose(EURUSDT_PAIR, closeMs);
    return eurusdt ? 1 / eurusdt : null;
  }
  const info = await getOrDetectPairInfo(asset);

  if (info.binanceEurPair) {
    const p = await hourlyClose(info.binanceEurPair, closeMs);
    if (p) return p;
  }
  if (info.binanceUsdtPair) {
    const [p, eurusdt] = await Promise.all([hourlyClose(info.binanceUsdtPair, closeMs), hourlyClose(EURUSDT_PAIR, closeMs)]);
    if (p && eurusdt) return p / eurusdt;
  }
  if (info.binanceBtcPair) {
    const [p, btcEur] = await Promise.all([hourlyClose(info.binanceBtcPair, closeMs), getClosePriceEur('BTC', day)]);
    if (p && btcEur) return p * btcEur;
  }
  if (info.binanceEthPair) {
    const [p, ethEur] = await Promise.all([hourlyClose(info.binanceEthPair, closeMs), getClosePriceEur('ETH', day)]);
    if (p && ethEur) return p * ethEur;
  }
  return null;
}

// ── API ────────────────────────────────────────────────────────────────────

const inFlight = new Map<string, Promise<number | null>>();

/**
 * Precio en EUR de `asset` al cierre del día local `day` (00:00 de Madrid del
 * día siguiente). null si no hay precio en ninguna fuente o el día aún no ha
 * cerrado.
 */
export function getClosePriceEur(asset: string, day: string): Promise<number | null> {
  if (PRICE_ALIASES[asset]) return getClosePriceEur(PRICE_ALIASES[asset], day);
  if (asset === 'EUR') return Promise.resolve(1);
  const closeMs = madridCloseInstant(day).getTime();
  if (closeMs > Date.now()) return Promise.resolve(null); // día no cerrado: no se cachea
  return dedupeByKey(inFlight, `${asset}|${day}`, () => resolveClose(asset, day, closeMs));
}

async function resolveClose(asset: string, day: string, closeMs: number): Promise<number | null> {
  const cached = await db.query(
    'SELECT price_eur FROM price_close_madrid WHERE asset = $1 AND close_date = $2',
    [asset, day],
  );
  if (cached.rows.length > 0) {
    const price = parseFloat(cached.rows[0].price_eur);
    return price > 0 ? price : null;
  }

  let price = await binanceClose(asset, day, closeMs);
  let source: CloseSource = 'binance_1h';

  if (price === null && withinCoinGeckoHistory(day)) {
    const nextUtcMidnight = new Date(`${nextDay(day)}T00:00:00.000Z`);
    const gecko = await getCoinGeckoDailyPriceEur(asset, nextUtcMidnight);
    if (gecko > 0) { price = gecko; source = 'coingecko_daily'; }
  }
  if (price === null) source = 'none';

  await db.query(
    `INSERT INTO price_close_madrid (asset, close_date, price_eur, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (asset, close_date) DO UPDATE
       SET price_eur = EXCLUDED.price_eur, source = EXCLUDED.source, fetched_at = NOW()`,
    [asset, day, price ?? -1, source],
  );
  return price;
}

/**
 * Precarga por lotes (5 en paralelo, 600 ms entre lotes: ~8 peticiones/s,
 * por debajo del límite de Binance). Los errores de un elemento se registran
 * y no detienen el resto.
 */
export async function prefetchClosePrices(items: ReadonlyArray<{ asset: string; day: string }>): Promise<void> {
  const CONCURRENCY = 5;
  const BATCH_DELAY_MS = 600;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(({ asset, day }) =>
      getClosePriceEur(asset, day).catch(e =>
        console.error(`[PRICES] Cierre ${asset} ${day} no disponible:`, (e as Error).message))));
    if (i + CONCURRENCY < items.length) await sleep(BATCH_DELAY_MS);
  }
}

// ── Lectura y precarga por rangos (P&L diario, #165) ──────────────────────

/**
 * Cierres en caché por activo y día. El valor -1 indica "sin precio en
 * ninguna fuente"; un día ausente aún no se ha descargado.
 */
export async function getCachedCloses(
  assets: readonly string[],
  fromDay: string,
  toDay: string,
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (assets.length === 0) return result;
  const res = await db.query(
    `SELECT asset, to_char(close_date, 'YYYY-MM-DD') AS day, price_eur::float AS price
     FROM price_close_madrid
     WHERE asset = ANY($1) AND close_date BETWEEN $2 AND $3`,
    [[...assets], fromDay, toDay],
  );
  for (const r of res.rows as { asset: string; day: string; price: number }[]) {
    if (!result.has(r.asset)) result.set(r.asset, new Map());
    result.get(r.asset)!.set(r.day, r.price);
  }
  return result;
}

/**
 * Descarga y guarda los cierres que faltan de un activo en un rango de días
 * cerrados. Usa series de velas horarias del par preferido (EUR, o USDT con
 * EURUSDT) en bloques de 1000 h; los días que no se resuelvan así siguen el
 * camino individual (pares BTC/ETH, CoinGecko, marca de sin precio).
 */
export async function prefetchCloseRange(asset: string, fromDay: string, toDay: string): Promise<void> {
  const target = PRICE_ALIASES[asset] ?? asset;
  if (target === 'EUR') return;
  const lastClosed = madridDateOf(Date.now() - 24 * HOUR_MS);
  const to = toDay < lastClosed ? toDay : lastClosed;
  if (fromDay > to) return;

  const cached = (await getCachedCloses([target], fromDay, to)).get(target) ?? new Map();
  let missing = daysBetween(fromDay, to).filter(d => !cached.has(d));
  if (missing.length === 0) return;

  const found = new Map<string, number>();
  if (target === 'USDT') {
    for (const [d, p] of await hourlyClosesForDays(EURUSDT_PAIR, missing)) found.set(d, 1 / p);
  }
  const info = target === 'USDT'
    ? { binanceEurPair: null, binanceUsdtPair: null, binanceBtcPair: null, binanceEthPair: null }
    : await getOrDetectPairInfo(target);
  if (info.binanceEurPair) {
    for (const [d, p] of await hourlyClosesForDays(info.binanceEurPair, missing)) found.set(d, p);
  }
  const stillMissing = missing.filter(d => !found.has(d));
  if (info.binanceUsdtPair && stillMissing.length > 0) {
    const [series, eurusdt] = await Promise.all([
      hourlyClosesForDays(info.binanceUsdtPair, stillMissing),
      hourlyClosesForDays(EURUSDT_PAIR, stillMissing),
    ]);
    for (const [d, p] of series) {
      const rate = eurusdt.get(d);
      if (rate) found.set(d, p / rate);
    }
  }

  if (found.size > 0) {
    const days = [...found.keys()];
    await db.query(
      `INSERT INTO price_close_madrid (asset, close_date, price_eur, source)
       SELECT $1, d, p, 'binance_1h' FROM unnest($2::date[], $3::numeric[]) AS x(d, p)
       ON CONFLICT (asset, close_date) DO NOTHING`,
      [target, days, days.map(d => found.get(d))],
    );
  }

  missing = missing.filter(d => !found.has(d));

  // Activos sin par en Binance: serie diaria de CoinGecko en una sola petición
  // (precio a las 00:00 UTC del día siguiente, el más cercano al cierre).
  const hasBinancePair = target === 'USDT' || Boolean(info.binanceEurPair || info.binanceUsdtPair || info.binanceBtcPair || info.binanceEthPair);
  if (!hasBinancePair && missing.length > 0) {
    const chart = await fetchMarketChart(target, COINGECKO_HISTORY_DAYS);
    const fromChart = new Map<string, number>();
    const noPrice: string[] = [];
    for (const day of missing) {
      const price = chart.get(nextDay(day));
      if (price && price > 0) fromChart.set(day, price);
      else if (!withinCoinGeckoHistory(day)) noPrice.push(day);
    }
    if (fromChart.size > 0) {
      const days = [...fromChart.keys()];
      await db.query(
        `INSERT INTO price_close_madrid (asset, close_date, price_eur, source)
         SELECT $1, d, p, 'coingecko_daily' FROM unnest($2::date[], $3::numeric[]) AS x(d, p)
         ON CONFLICT (asset, close_date) DO NOTHING`,
        [target, days, days.map(d => fromChart.get(d))],
      );
    }
    if (noPrice.length > 0) {
      await db.query(
        `INSERT INTO price_close_madrid (asset, close_date, price_eur, source)
         SELECT $1, d, -1, 'none' FROM unnest($2::date[]) AS x(d)
         ON CONFLICT (asset, close_date) DO NOTHING`,
        [target, noPrice],
      );
    }
    missing = missing.filter(d => !fromChart.has(d) && !noPrice.includes(d));
  }

  for (const day of missing) {
    await getClosePriceEur(target, day).catch(e =>
      console.error(`[PRICES] Cierre ${target} ${day} no disponible:`, (e as Error).message));
    await sleep(150);
  }
}

