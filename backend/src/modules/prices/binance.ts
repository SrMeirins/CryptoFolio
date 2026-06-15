import { db } from '../../db/client';
import { WebSocket } from 'ws';
import { getOrDetectPairInfo, loadPairCache, getPairInfo } from './pairDetector';
import { getHistoricalPriceEur as getCoinGeckoHistoricalPrice, searchAndSaveCoinGeckoId } from './coingecko';

const REST_BASE = 'https://api.binance.com/api/v3';

// Tokens cuyo precio es equivalente al de otro activo (1:1 o redemption peg).
// Se resuelven antes de tocar caché o APIs externas.
const PRICE_ALIASES: Record<string, string> = {
  'BETH':  'ETH',   // Binance staked ETH (1:1 ETH, retirado en 2023)
  'WETH':  'ETH',   // Wrapped ETH
  'WBTC':  'BTC',   // Wrapped BTC
  'BTCB':  'BTC',   // Binance-pegged BTC
};

const liveCache = new Map<string, number>();
let eurUsdtRate = 1.0;

// ── Carga inicial de precios via REST ─────────────────────────────────────
async function loadInitialPrices(): Promise<void> {
  try {
    await loadPairCache();

    const res = await db.query(
      `SELECT symbol, binance_eur_pair, binance_usdt_pair, binance_btc_pair,
              binance_eth_pair, price_source, is_stablecoin
       FROM asset_metadata
       WHERE price_source != 'unknown'`
    );

    // Construir lista de pares a consultar
    const pairsToFetch = new Set<string>(['EURUSDT']);
    for (const row of res.rows) {
      if (row.binance_eur_pair)  pairsToFetch.add(row.binance_eur_pair);
      if (row.binance_usdt_pair) pairsToFetch.add(row.binance_usdt_pair);
      if (row.binance_btc_pair)  pairsToFetch.add(row.binance_btc_pair);
      if (row.binance_eth_pair)  pairsToFetch.add(row.binance_eth_pair);
    }

    const symbols = [...pairsToFetch].map(p => `"${p}"`).join(',');
    const fetchRes = await fetch(`${REST_BASE}/ticker/price?symbols=[${symbols}]`);
    if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`);

    const data = await fetchRes.json() as Array<{ symbol: string; price: string }>;
    const priceMap = new Map(data.map(d => [d.symbol, parseFloat(d.price)]));

    // EURUSDT primero
    const eurusdt = priceMap.get('EURUSDT');
    if (eurusdt) {
      eurUsdtRate = 1 / eurusdt;
      liveCache.set('USDT', eurUsdtRate);
    }

    // Procesar cada activo
    for (const row of res.rows) {
      if (row.price_source === 'fiat') {
        liveCache.set(row.symbol, row.symbol === 'EUR' ? 1 : eurUsdtRate);
        continue;
      }

      let priceEur: number | null = null;

      if (row.binance_eur_pair) {
        const p = priceMap.get(row.binance_eur_pair);
        if (p) priceEur = p;
      }

      if (!priceEur && row.binance_usdt_pair) {
        const p = priceMap.get(row.binance_usdt_pair);
        if (p) priceEur = p * eurUsdtRate;
      }

      if (!priceEur && row.binance_btc_pair) {
        const p = priceMap.get(row.binance_btc_pair);
        const btcEur = priceMap.get('BTCEUR') ?? liveCache.get('BTC') ?? 0;
        if (p && btcEur) priceEur = p * btcEur;
      }

      if (!priceEur && row.binance_eth_pair) {
        const p = priceMap.get(row.binance_eth_pair);
        const ethEur = priceMap.get('ETHEUR') ?? liveCache.get('ETH') ?? 0;
        if (p && ethEur) priceEur = p * ethEur;
      }

      if (priceEur) liveCache.set(row.symbol, priceEur);
    }

    liveCache.set('EUR', 1);
  } catch (e) {
    console.error('[PRICES] Error cargando precios iniciales:', (e as Error).message);
  }
}

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
    const res = await fetch(url);

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

  const key = `${symbol}|${date.toISOString().slice(0, 10)}`;
  const existing = inFlightPrices.get(key);
  if (existing) return existing;

  const promise = _getHistoricalPriceEur(symbol, date).finally(() => {
    inFlightPrices.delete(key);
  });
  inFlightPrices.set(key, promise);
  return promise;
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

  // 3. Intentar cada par de Binance en orden de preferencia.
  //    Cada uno puede fallar si el activo fue delistado o sin datos históricos.
  let priceEur = 0;

  if (info.binanceEurPair) {
    try {
      priceEur = await fetchKlinePrice(info.binanceEurPair, date);
    } catch { /* par sin datos — probar siguiente */ }
  }

  if (!priceEur && info.binanceUsdtPair) {
    try {
      const [priceUsdt, usdtEur] = await Promise.all([
        fetchKlinePrice(info.binanceUsdtPair, date),
        getHistoricalUsdtEur(date),
      ]);
      priceEur = priceUsdt * usdtEur;
    } catch { /* par sin datos — probar siguiente */ }
  }

  if (!priceEur && info.binanceBtcPair) {
    try {
      const [pricePair, btcEur] = await Promise.all([
        fetchKlinePrice(info.binanceBtcPair, date),
        getHistoricalPriceEur('BTC', date),
      ]);
      priceEur = pricePair * btcEur;
    } catch { /* par sin datos — probar ETH proxy */ }
  }

  if (!priceEur && info.binanceEthPair) {
    try {
      const [pricePair, ethEur] = await Promise.all([
        fetchKlinePrice(info.binanceEthPair, date),
        getHistoricalPriceEur('ETH', date),
      ]);
      priceEur = pricePair * ethEur;
    } catch { /* par sin datos — probar CoinGecko */ }
  }

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

// ── WebSocket: precios en tiempo real ─────────────────────────────────────
let ws: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
const priceUpdateCallbacks: Array<(prices: Map<string, number>) => void> = [];

export function onPriceUpdate(cb: (prices: Map<string, number>) => void): void {
  priceUpdateCallbacks.push(cb);
}

export function startLivePrices(): void {
  loadInitialPrices().then(() => {
    if (priceUpdateCallbacks.length > 0) {
      const snapshot = new Map(liveCache);
      for (const cb of priceUpdateCallbacks) cb(snapshot);
    }
  });

  // Construir streams desde DB dinámicamente
  db.query(
    `SELECT binance_eur_pair, binance_usdt_pair, binance_btc_pair, binance_eth_pair
     FROM asset_metadata
     WHERE price_source NOT IN ('fiat', 'unknown')`
  ).then(res => {
    const pairs = new Set<string>(['eurusdt']);
    for (const row of res.rows) {
      if (row.binance_eur_pair)  pairs.add(row.binance_eur_pair.toLowerCase());
      if (row.binance_usdt_pair) pairs.add(row.binance_usdt_pair.toLowerCase());
      if (row.binance_btc_pair)  pairs.add(row.binance_btc_pair.toLowerCase());
      if (row.binance_eth_pair)  pairs.add(row.binance_eth_pair.toLowerCase());
    }

    const streams = [...pairs].map(p => `${p}@miniTicker`).join('/');
    const streamUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    connectWebSocket(streamUrl);
  });
}

function connectWebSocket(streamUrl: string): void {
  ws = new WebSocket(streamUrl);

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as {
        data: { s: string; c: string }
      };
      const symbol = msg.data.s;
      const price = parseFloat(msg.data.c);

      if (symbol === 'EURUSDT') {
        eurUsdtRate = 1 / price;
        liveCache.set('USDT', eurUsdtRate);
      }

      // Buscar qué activo corresponde a este par
      const allAssets = await db.query(
        `SELECT symbol, binance_eur_pair, binance_usdt_pair, binance_btc_pair, binance_eth_pair
         FROM asset_metadata
         WHERE binance_eur_pair = $1 OR binance_usdt_pair = $1
            OR binance_btc_pair = $1 OR binance_eth_pair = $1`,
        [symbol]
      );

      for (const row of allAssets.rows) {
        let priceEur: number | null = null;

        if (row.binance_eur_pair === symbol) {
          priceEur = price;
        } else if (row.binance_usdt_pair === symbol) {
          priceEur = price * eurUsdtRate;
        } else if (row.binance_btc_pair === symbol) {
          const btcEur = liveCache.get('BTC') ?? 0;
          if (btcEur) priceEur = price * btcEur;
        } else if (row.binance_eth_pair === symbol) {
          const ethEur = liveCache.get('ETH') ?? 0;
          if (ethEur) priceEur = price * ethEur;
        }

        if (priceEur) liveCache.set(row.symbol, priceEur);
      }

      liveCache.set('EUR', 1);

      if (priceUpdateCallbacks.length > 0) {
        const snapshot = new Map(liveCache);
        for (const cb of priceUpdateCallbacks) cb(snapshot);
      }
    } catch { /* ignorar */ }
  });

  ws.on('close', () => {
    console.warn('[WS] Desconectado. Reconectando en 5s...');
    wsReconnectTimer = setTimeout(() => connectWebSocket(streamUrl), 5000);
  });

  ws.on('error', (err) => console.error('[WS] Error:', err.message));
}

export function stopLivePrices(): void {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  if (ws) ws.close();
}

export function getLivePrice(symbol: string): number | null {
  return symbol === 'EUR' ? 1 : liveCache.get(symbol) ?? null;
}

export function getAllLivePrices(): Map<string, number> {
  const result = new Map(liveCache);
  result.set('EUR', 1);
  return result;
}

export async function loadAssetMetadata(): Promise<void> {
  await loadPairCache();
}

// Refresca el liveCache para un conjunto de activos recién detectados.
// Se llama al final del import para que nuevos activos tengan precio inmediatamente.
export async function refreshLivePrices(symbols: string[]): Promise<void> {
  if (symbols.length === 0) return;

  const pairsToFetch = new Set<string>(['EURUSDT']);
  for (const symbol of symbols) {
    const info = await getOrDetectPairInfo(symbol);
    if (info.binanceEurPair)  pairsToFetch.add(info.binanceEurPair);
    if (info.binanceUsdtPair) pairsToFetch.add(info.binanceUsdtPair);
    if (info.binanceBtcPair)  pairsToFetch.add(info.binanceBtcPair);
    if (info.binanceEthPair)  pairsToFetch.add(info.binanceEthPair);
  }

  try {
    const syms = [...pairsToFetch].map(p => `"${p}"`).join(',');
    const fetchRes = await fetch(`${REST_BASE}/ticker/price?symbols=[${syms}]`);
    if (!fetchRes.ok) return;
    const data = await fetchRes.json() as Array<{ symbol: string; price: string }>;
    const priceMap = new Map(data.map(d => [d.symbol, parseFloat(d.price)]));

    const eurusdt = priceMap.get('EURUSDT');
    const localEurUsdtRate = eurusdt ? 1 / eurusdt : eurUsdtRate;

    for (const symbol of symbols) {
      const info = getPairInfo(symbol);
      if (!info) continue;
      let priceEur: number | null = null;
      if (info.binanceEurPair)  priceEur = priceMap.get(info.binanceEurPair) ?? null;
      if (!priceEur && info.binanceUsdtPair) {
        const p = priceMap.get(info.binanceUsdtPair);
        if (p) priceEur = p * localEurUsdtRate;
      }
      if (priceEur) liveCache.set(symbol, priceEur);
    }
  } catch { /* silencioso — se reintentará en el siguiente ciclo WebSocket */ }
}
