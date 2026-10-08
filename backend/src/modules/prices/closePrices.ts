import { db } from '../../db/client';
import { getOrDetectPairInfo } from './pairDetector';
import { getHistoricalPriceEur as getCoinGeckoDailyPriceEur } from './coingecko';
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

// ── Binance: vela horaria que termina en el instante de cierre ─────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Cierre de la vela de 1 h que abre una hora antes de `closeMs`. Devuelve null
// si Binance no tiene vela (par inexistente en esa fecha); lanza error ante
// fallos transitorios.
async function hourlyClose(pair: string, closeMs: number): Promise<number | null> {
  const url = `${REST_BASE}/klines?symbol=${encodeURIComponent(pair)}&interval=1h&startTime=${closeMs - HOUR_MS}&limit=1`;
  for (let attempt = 1; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetchWithTimeout(url);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10);
      await sleep(retryAfter > 0 ? retryAfter * 1000 : attempt * 10_000);
      continue;
    }
    if (res.status === 400) return null; // par inexistente
    if (!res.ok) throw new Error(`Binance klines HTTP ${res.status} para ${pair}`);
    const data = await res.json() as unknown[][];
    if (!Array.isArray(data) || data.length === 0) return null;
    const close = parseFloat(String(data[0][4]));
    return close > 0 ? close : null;
  }
  throw new Error(`Binance klines: reintentos agotados por rate limit para ${pair}`);
}

async function binanceClose(asset: string, day: string, closeMs: number): Promise<number | null> {
  const info = await getOrDetectPairInfo(asset);

  if (info.binanceEurPair) {
    const p = await hourlyClose(info.binanceEurPair, closeMs);
    if (p) return p;
  }
  if (info.binanceUsdtPair) {
    const [p, eurusdt] = await Promise.all([hourlyClose(info.binanceUsdtPair, closeMs), hourlyClose('EURUSDT', closeMs)]);
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

  if (price === null) {
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
