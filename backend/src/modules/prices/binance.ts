import { db } from '../../db/client';
import { WebSocket } from 'ws';
import { getOrDetectPairInfo, loadPairCache, getPairInfo } from './pairDetector';

const REST_BASE = 'https://api.binance.com/api/v3';

const liveCache = new Map<string, number>();
let eurUsdtRate = 1.0;

// ── Carga inicial de precios via REST ─────────────────────────────────────
async function loadInitialPrices(): Promise<void> {
  try {
    await loadPairCache();

    const res = await db.query(
      `SELECT symbol, binance_eur_pair, binance_usdt_pair, binance_btc_pair, price_source, is_stablecoin
       FROM asset_metadata
       WHERE price_source != 'unknown'`
    );

    // Construir lista de pares a consultar
    const pairsToFetch = new Set<string>(['EURUSDT']);
    for (const row of res.rows) {
      if (row.binance_eur_pair)  pairsToFetch.add(row.binance_eur_pair);
      if (row.binance_usdt_pair) pairsToFetch.add(row.binance_usdt_pair);
      if (row.binance_btc_pair)  pairsToFetch.add(row.binance_btc_pair);
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

      if (priceEur) liveCache.set(row.symbol, priceEur);
    }

    liveCache.set('EUR', 1);
    console.log(`[PRICES] Precios iniciales cargados: ${liveCache.size} activos ✓`);
  } catch (e) {
    console.error('[PRICES] Error cargando precios iniciales:', (e as Error).message);
  }
}

// ── REST: precio histórico ─────────────────────────────────────────────────
async function fetchKlinePrice(pair: string, date: Date): Promise<number> {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const startTime = d.getTime();
  const endTime = startTime + 24 * 60 * 60 * 1000;

  const url = `${REST_BASE}/klines?symbol=${pair}&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance klines HTTP ${res.status} para ${pair}`);

  const data = await res.json() as unknown[][];
  if (!data || data.length === 0) throw new Error(`Sin datos para ${pair} @ ${date.toISOString()}`);

  return parseFloat(data[0][4] as string);
}

export async function getHistoricalPriceEur(symbol: string, date: Date): Promise<number> {
  if (symbol === 'EUR') return 1;

  const dateStr = date.toISOString().slice(0, 10);

  // 1. Caché DB
  const cached = await db.query(
    'SELECT price_eur FROM price_cache WHERE asset = $1 AND price_date = $2',
    [symbol, dateStr]
  );
  if (cached.rows.length > 0) return parseFloat(cached.rows[0].price_eur);

  // 2. Obtener info del par (DB o auto-detectar)
  const info = await getOrDetectPairInfo(symbol);

  if (info.priceSource === 'fiat') {
    if (symbol === 'EUR') return 1;
    // USDT: necesitamos tipo de cambio histórico
    const usdtEur = await getHistoricalUsdtEur(date);
    await cachePrice(symbol, usdtEur, dateStr);
    return usdtEur;
  }

  if (info.priceSource === 'unknown') {
    console.warn(`[PRICES] Sin par conocido para ${symbol} @ ${dateStr}, usando 0`);
    return 0;
  }

  let priceEur = 0;

  if (info.binanceEurPair) {
    priceEur = await fetchKlinePrice(info.binanceEurPair, date);
  } else if (info.binanceUsdtPair) {
    const [priceUsdt, usdtEur] = await Promise.all([
      fetchKlinePrice(info.binanceUsdtPair, date),
      getHistoricalUsdtEur(date),
    ]);
    priceEur = priceUsdt * usdtEur;
  } else if (info.binanceBtcPair) {
    const [priceBtc, btcEur] = await Promise.all([
      fetchKlinePrice(info.binanceBtcPair, date),
      getHistoricalPriceEur('BTC', date),
    ]);
    priceEur = priceBtc * btcEur;
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

  if (toFetch.length === 0) {
    console.log('[PRICES] Todos los precios históricos en caché ✓');
    return;
  }

  console.log(`[PRICES] Precargando ${toFetch.length} precios en paralelo...`);
  const CONCURRENCY = 10;
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(({ symbol, date }) =>
        getHistoricalPriceEur(symbol, date).catch(e =>
          console.warn(`[PRICES] Error ${symbol} @ ${date.toISOString().slice(0, 10)}: ${e.message}`)
        )
      )
    );
    console.log(`[PRICES] ${Math.min(i + CONCURRENCY, toFetch.length)}/${toFetch.length} completados`);
  }
  console.log('[PRICES] Precarga completada ✓');
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
    `SELECT binance_eur_pair, binance_usdt_pair, binance_btc_pair
     FROM asset_metadata
     WHERE price_source NOT IN ('fiat', 'unknown')`
  ).then(res => {
    const pairs = new Set<string>(['eurusdt']);
    for (const row of res.rows) {
      if (row.binance_eur_pair)  pairs.add(row.binance_eur_pair.toLowerCase());
      if (row.binance_usdt_pair) pairs.add(row.binance_usdt_pair.toLowerCase());
      if (row.binance_btc_pair)  pairs.add(row.binance_btc_pair.toLowerCase());
    }

    const streams = [...pairs].map(p => `${p}@miniTicker`).join('/');
    const streamUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    connectWebSocket(streamUrl);
  });
}

function connectWebSocket(streamUrl: string): void {
  console.log('[WS] Conectando a Binance WebSocket...');
  ws = new WebSocket(streamUrl);

  ws.on('open', () => console.log('[WS] Binance WebSocket conectado ✓'));

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
        `SELECT symbol, binance_eur_pair, binance_usdt_pair, binance_btc_pair
         FROM asset_metadata
         WHERE binance_eur_pair = $1 OR binance_usdt_pair = $1 OR binance_btc_pair = $1`,
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
  console.log('[PRICES] Usando Binance API dinámica (sin hardcodeo) ✓');
}
