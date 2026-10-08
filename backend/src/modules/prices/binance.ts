import { db } from '../../db/client';
import { getOrDetectPairInfo, loadPairCache, getPairInfo } from './pairDetector';
import {
  getHistoricalPriceEur as getCoinGeckoHistoricalPrice,
  searchAndSaveCoinGeckoId,
} from './coingecko';
import { fetchWithTimeout } from './httpTimeout';
import { dedupeByKey, priceKey } from './priceDedup';

// Precios históricos (velas diarias de Binance con respaldo en CoinGecko).
// El feed de precios en vivo vive en liveFeed.ts; se reexporta aquí para no
// cambiar los imports existentes.
export {
  startLivePrices, stopLivePrices, onPriceUpdate, offPriceUpdate,
  getLivePrice, getAllLivePrices, refreshLivePrices, refreshPairIndex,
  handleTickerMessage, syncLivePriceSubscriptions, requestLivePriceResync,
} from './liveFeed';

const REST_BASE = 'https://api.binance.com/api/v3';

// Tokens cuyo precio es equivalente al de otro activo (1:1 o redemption peg).
// Se resuelven antes de tocar caché o APIs externas.
const PRICE_ALIASES: Record<string, string> = {
  'BETH':  'ETH',   // Binance staked ETH (1:1 ETH, retirado en 2023)
  'WETH':  'ETH',   // Wrapped ETH
  'WBTC':  'BTC',   // Wrapped BTC
  'BTCB':  'BTC',   // Binance-pegged BTC
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── REST: precio histórico con retry ante rate-limit ─────────────────────
async function fetchKlinePrice(pair: string, date: Date, retries = 3): Promise<number> {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const startTime = d.getTime();
  const endTime = startTime + 24 * 60 * 60 * 1000;

  const url = `${REST_BASE}/klines?symbol=${pair}&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=1`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetchWithTimeout(url);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 10000;
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) throw new Error(`Binance klines HTTP ${res.status} para ${pair}`);

    const data = await res.json() as unknown[][];
    if (!data || data.length === 0) throw new Error(`Sin datos para ${pair} @ ${date.toISOString()}`);

    return parseFloat(data[0][4] as string);
  }

  throw new Error(`fetchKlinePrice agotó reintentos para ${pair}`);
}

// In-flight dedup: evita N queries concurrentes para el mismo (symbol, date).
const inFlightPrices = new Map<string, Promise<number>>();

// Cache en memoria de pares sin precio conocido (symbol|dateStr = -1 sentinel).
// Cuando Binance+CoinGecko fallan, se persiste -1 en DB Y en este Set para que
// el motor FIFO y reimportaciones no relancen el mismo ciclo de reintentos + 429.
const noPricePairs = new Set<string>();

export async function getHistoricalPriceEur(symbol: string, date: Date): Promise<number> {
  if (symbol === 'EUR') return 1;

  if (PRICE_ALIASES[symbol]) {
    return getHistoricalPriceEur(PRICE_ALIASES[symbol], date);
  }

  const key = priceKey(symbol, date);
  return dedupeByKey(inFlightPrices, key, () => _getHistoricalPriceEur(symbol, date));
}

// Consulta de precio histórico para la API pública (GET /api/prices/historical).
// A diferencia de getHistoricalPriceEur, no tiene efectos secundarios para
// símbolos desconocidos: no los registra en asset_metadata ni persiste el
// sentinela -1 en price_cache (#146). Los activos registrados o con par
// detectado siguen el camino normal, con su caché.
export async function lookupHistoricalPriceEur(symbol: string, date: Date): Promise<number> {
  if (symbol === 'EUR' || PRICE_ALIASES[symbol]) return getHistoricalPriceEur(symbol, date);

  const info = await getOrDetectPairInfo(symbol, { persistUnknown: false });
  if (info.priceSource === 'unknown' && !getPairInfo(symbol)) return 0;

  return getHistoricalPriceEur(symbol, date);
}

async function _getHistoricalPriceEur(symbol: string, date: Date): Promise<number> {
  const dateStr = date.toISOString().slice(0, 10);
  const key = `${symbol}|${dateStr}`;

  // Cache en memoria: par ya conocido sin precio en esta sesión — evita DB + API
  if (noPricePairs.has(key)) return 0;

  // 1. Caché DB (incluye sentinela -1 = sin precio disponible en ninguna fuente)
  const cached = await db.query(
    'SELECT price_eur FROM price_cache WHERE asset = $1 AND price_date = $2',
    [symbol, dateStr]
  );
  if (cached.rows.length > 0) {
    const price = parseFloat(cached.rows[0].price_eur);
    if (price < 0) {
      noPricePairs.add(key); // también en memoria para siguientes requests
      return 0;
    }
    return price;
  }

  // 2. Obtener info del par (DB o auto-detectar)
  const info = await getOrDetectPairInfo(symbol);

  if (info.priceSource === 'fiat') {
    if (symbol === 'EUR') return 1;
    const usdtEur = await getHistoricalUsdtEur(date);
    await cachePrice(symbol, usdtEur, dateStr);
    return usdtEur;
  }

  // 3. Lanzar todos los pares de Binance en paralelo (no tienen rate limit propio).
  //    Preferencia EUR > USDT > BTC > ETH: usamos el de mayor prioridad que tenga dato.
  //    inFlightPrices deduplicará llamadas concurrentes al mismo (BTC/ETH, fecha).
  let priceEur: number;

  const [eurR, usdtR, btcR, ethR] = await Promise.allSettled([
    info.binanceEurPair
      ? fetchKlinePrice(info.binanceEurPair, date)
      : Promise.reject(new Error('no pair')),
    info.binanceUsdtPair
      ? Promise.all([fetchKlinePrice(info.binanceUsdtPair, date), getHistoricalUsdtEur(date)])
          .then(([p, u]) => p * u)
      : Promise.reject(new Error('no pair')),
    info.binanceBtcPair
      ? Promise.all([fetchKlinePrice(info.binanceBtcPair, date), getHistoricalPriceEur('BTC', date)])
          .then(([p, b]) => p * b)
      : Promise.reject(new Error('no pair')),
    info.binanceEthPair
      ? Promise.all([fetchKlinePrice(info.binanceEthPair, date), getHistoricalPriceEur('ETH', date)])
          .then(([p, e]) => p * e)
      : Promise.reject(new Error('no pair')),
  ]);

  priceEur =
    (eurR.status  === 'fulfilled' && eurR.value  > 0 ? eurR.value  : 0) ||
    (usdtR.status === 'fulfilled' && usdtR.value > 0 ? usdtR.value : 0) ||
    (btcR.status  === 'fulfilled' && btcR.value  > 0 ? btcR.value  : 0) ||
    (ethR.status  === 'fulfilled' && ethR.value  > 0 ? ethR.value  : 0);

  // 4. Fallback a CoinGecko si Binance no tiene datos históricos
  //    (activos delistados, tokens no nativos de Binance, etc.)
  if (!priceEur) {
    try {
      // Asegurar que tenemos coingecko_id antes de llamar
      await searchAndSaveCoinGeckoId(symbol);
      priceEur = await getCoinGeckoHistoricalPrice(symbol, date);
    } catch { /* sin precio disponible */ }
  }

  if (!priceEur) {
    console.warn(`[PRICES] Sin precio para ${symbol} @ ${dateStr} en Binance ni CoinGecko`);
    // Persistir sentinel -1: evita reintentos en el motor FIFO y próximas sesiones.
    // ON CONFLICT DO NOTHING para no pisar un precio real que llegara después.
    noPricePairs.add(key);
    await db.query(
      `INSERT INTO price_cache (asset, price_eur, price_date, source)
       VALUES ($1, -1, $2, 'no_data')
       ON CONFLICT (asset, price_date) DO NOTHING`,
      [symbol, dateStr]
    );
    return 0;
  }

  await cachePrice(symbol, priceEur, dateStr);
  return priceEur;
}

async function getHistoricalUsdtEur(date: Date): Promise<number> {
  const dateStr = date.toISOString().slice(0, 10);
  const cached = await db.query(
    'SELECT price_eur FROM price_cache WHERE asset = $1 AND price_date = $2',
    ['USDT', dateStr]
  );
  if (cached.rows.length > 0) return parseFloat(cached.rows[0].price_eur);

  const eurUsdtPrice = await fetchKlinePrice('EURUSDT', date);
  const usdtEur = 1 / eurUsdtPrice;
  await cachePrice('USDT', usdtEur, dateStr);
  return usdtEur;
}

async function cachePrice(symbol: string, price: number, dateStr: string): Promise<void> {
  await db.query(
    `INSERT INTO price_cache (asset, price_eur, price_date, source)
     VALUES ($1, $2, $3, 'binance')
     ON CONFLICT (asset, price_date) DO UPDATE SET price_eur = EXCLUDED.price_eur`,
    [symbol, price, dateStr]
  );
}

// ── Precarga paralela ──────────────────────────────────────────────────────
export async function prefetchHistoricalPrices(
  required: Array<{ symbol: string; date: Date }>
): Promise<void> {
  if (required.length === 0) return;

  const unique = new Map<string, Date>();
  for (const { symbol, date } of required) {
    if (symbol === 'EUR') continue;
    const key = `${symbol}|${date.toISOString().slice(0, 10)}`;
    if (!unique.has(key)) unique.set(key, date);
  }

  const toFetch: Array<{ symbol: string; date: Date }> = [];
  for (const [key, date] of unique) {
    const symbol = key.split('|')[0];
    const cached = await db.query(
      'SELECT id FROM price_cache WHERE asset = $1 AND price_date = $2',
      [symbol, date.toISOString().slice(0, 10)]
    );
    if (cached.rows.length === 0) toFetch.push({ symbol, date });
  }

  if (toFetch.length === 0) return;

  // Binance klines: peso 2, límite ~1200/min → máx ~600 llamadas/min (~10/seg).
  // Batches de 5 con 600ms entre lotes = ~8 llamadas/seg, con margen de seguridad.
  const CONCURRENCY = 5;
  const BATCH_DELAY_MS = 600;

  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(({ symbol, date }) => getHistoricalPriceEur(symbol, date).catch(() => {}))
    );
    if (i + CONCURRENCY < toFetch.length) await sleep(BATCH_DELAY_MS);
  }
}

export async function loadAssetMetadata(): Promise<void> {
  await loadPairCache();
}
