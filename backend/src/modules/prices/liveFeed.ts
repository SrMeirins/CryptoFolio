import { db } from '../../db/client';
import { WebSocket } from 'ws';
import { getOrDetectPairInfo, loadPairCache, getPairInfo } from './pairDetector';
import { getCurrentPricesEur, loadAssetMetadata as loadCoinGeckoIdMap } from './coingecko';
import { fetchWithTimeout } from './httpTimeout';
import { buildPairIndex, resolveTick, streamPairs, priceFromPairMap, EURUSDT_PAIR, type AssetPairsRow, type PairIndex } from './livePairIndex';
import { createPriceBroadcaster, type PriceListener } from './priceBroadcaster';

// Feed de precios en vivo: carga inicial por REST, WebSocket de Binance con
// suscripciones dinámicas, refresco periódico de activos solo-CoinGecko y
// difusión agrupada a los clientes de la app.

const REST_BASE = 'https://api.binance.com/api/v3';

// Activos price_source='coingecko' sin ningún par de Binance: CoinGecko no
// tiene WebSocket, así que es la única forma de que alguna vez tengan un
// precio en vivo — sin esto, getLivePrice() les devolvía null para siempre
// (getCurrentPricesEur y PRICE_REFRESH_INTERVAL_MS existían ya pero sin
// conectar entre sí). Documentado en el README; 60s por defecto.
const COINGECKO_REFRESH_MS = Number(process.env.PRICE_REFRESH_INTERVAL_MS ?? 60000);

const liveCache = new Map<string, number>();
let eurUsdtRate = 1.0;

// Emite a los suscriptores (WebSocket de la app) los cambios agrupados, como
// mucho una vez por segundo (#148).
const broadcaster = createPriceBroadcaster();

// Único punto de escritura del caché en vivo: registra el cambio para la
// siguiente emisión agrupada.
function setLivePrice(symbol: string, price: number): void {
  if (liveCache.get(symbol) === price) return;
  liveCache.set(symbol, price);
  broadcaster.queue(symbol, price);
}

// Precio de hace 24h (apertura de la ventana móvil de 24h de Binance) en EUR,
// por activo, para la variación de 24h en tiempo real (#147). Llega en el
// campo `o` de los mismos mensajes miniTicker: sin peticiones adicionales.
const open24Cache = new Map<string, number>();
const open24Broadcaster = createPriceBroadcaster();
let eurUsdtOpenRate: number | undefined;

function setOpen24Price(symbol: string, price: number): void {
  if (open24Cache.get(symbol) === price) return;
  open24Cache.set(symbol, price);
  open24Broadcaster.queue(symbol, price);
}

// Últimos precios y precios de apertura de 24h de un conjunto de pares, en
// una sola llamada REST (ticker 24hr, formato MINI).
async function fetchMiniTickers(pairs: Iterable<string>): Promise<{ last: Map<string, number>; open: Map<string, number> }> {
  const symbols = encodeURIComponent(JSON.stringify([...pairs]));
  const res = await fetchWithTimeout(`${REST_BASE}/ticker/24hr?symbols=${symbols}&type=MINI`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as Array<{ symbol: string; lastPrice: string; openPrice: string }>;
  return {
    last: new Map(data.map(d => [d.symbol, parseFloat(d.lastPrice)])),
    open: new Map(data.map(d => [d.symbol, parseFloat(d.openPrice)])),
  };
}

// Aplica a los dos cachés (último y apertura 24h) los precios REST de un
// conjunto de activos, con la misma cascada de pares que el WebSocket.
function applyRestTickers(rows: Array<AssetPairsRow & { price_source?: string }>, tickers: { last: Map<string, number>; open: Map<string, number> }): void {
  const lastEurUsdt = tickers.last.get(EURUSDT_PAIR);
  const openEurUsdt = tickers.open.get(EURUSDT_PAIR);
  if (lastEurUsdt) { eurUsdtRate = 1 / lastEurUsdt; setLivePrice('USDT', eurUsdtRate); }
  if (openEurUsdt) { eurUsdtOpenRate = 1 / openEurUsdt; setOpen24Price('USDT', eurUsdtOpenRate); }

  const liveRates = () => ({ eurUsdtRate, btcEur: tickers.last.get('BTCEUR') ?? liveCache.get('BTC'), ethEur: tickers.last.get('ETHEUR') ?? liveCache.get('ETH') });
  const openRates = () => ({ eurUsdtRate: eurUsdtOpenRate ?? 0, btcEur: tickers.open.get('BTCEUR') ?? open24Cache.get('BTC'), ethEur: tickers.open.get('ETHEUR') ?? open24Cache.get('ETH') });

  for (const row of rows) {
    if (row.price_source === 'fiat') {
      setLivePrice(row.symbol, row.symbol === 'EUR' ? 1 : eurUsdtRate);
      setOpen24Price(row.symbol, row.symbol === 'EUR' ? 1 : (eurUsdtOpenRate ?? eurUsdtRate));
      continue;
    }
    const last = priceFromPairMap(row, tickers.last, liveRates());
    if (last) setLivePrice(row.symbol, last);
    const open = priceFromPairMap(row, tickers.open, openRates());
    if (open) setOpen24Price(row.symbol, open);
  }
  setLivePrice('EUR', 1);
  setOpen24Price('EUR', 1);
}

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

    applyRestTickers(res.rows, await fetchMiniTickers(pairsToFetch));
  } catch (e) {
    console.error('[PRICES] Error cargando precios iniciales:', (e as Error).message);
  }
}

// ── Fallback CoinGecko para activos sin par de Binance ───────────────────
// CoinGecko no tiene WebSocket — es la única forma de refrescar estos
// precios. Se ejecuta tras la carga inicial y luego cada COINGECKO_REFRESH_MS.
async function refreshCoinGeckoOnlyPrices(): Promise<void> {
  try {
    const res = await db.query(
      `SELECT symbol FROM asset_metadata WHERE price_source = 'coingecko'`
    );
    const symbols = (res.rows as { symbol: string }[]).map(r => r.symbol);
    if (symbols.length === 0) return;

    // getCurrentPricesEur solo resuelve símbolos con coingecko_id ya cargado
    // en memoria (coingeckoIds.ts) — nada más lo invocaba en el arranque real
    // del servidor, así que sin esto el mapa estaba siempre vacío y el
    // fallback no resolvía ningún precio. Recargarlo aquí (barato, una query)
    // también mantiene el mapa al día si el usuario edita el coingecko_id.
    await loadCoinGeckoIdMap();

    const prices = await getCurrentPricesEur(symbols);
    for (const [symbol, price] of prices) {
      if (symbol !== 'EUR') setLivePrice(symbol, price);
    }
  } catch (e) {
    console.error('[PRICES] Error refrescando precios CoinGecko-only:', (e as Error).message);
  }
}

// ── WebSocket: precios en tiempo real ─────────────────────────────────────
let ws: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let coinGeckoRefreshTimer: ReturnType<typeof setInterval> | null = null;
let pairIndex: PairIndex = new Map();

// Los suscriptores reciben solo los precios que han cambiado (delta),
// agrupados como mucho una vez por segundo. El snapshot completo se obtiene
// con getAllLivePrices() (p. ej. al conectar un cliente).
export function onPriceUpdate(cb: PriceListener): void {
  broadcaster.subscribe(cb);
}

export function offPriceUpdate(cb: PriceListener): void {
  broadcaster.unsubscribe(cb);
}

// Mismo mecanismo para el precio de hace 24h (solo cambios, agrupados).
export function onOpen24Update(cb: PriceListener): void {
  open24Broadcaster.subscribe(cb);
}

export function offOpen24Update(cb: PriceListener): void {
  open24Broadcaster.unsubscribe(cb);
}

export function getAllOpen24Prices(): Map<string, number> {
  const result = new Map(open24Cache);
  result.set('EUR', 1);
  return result;
}

export function startLivePrices(): void {
  loadInitialPrices().then(refreshCoinGeckoOnlyPrices);

  coinGeckoRefreshTimer = setInterval(refreshCoinGeckoOnlyPrices, COINGECKO_REFRESH_MS);

  feedRunning = true;
  refreshPairIndex()
    .then(() => connectWebSocket())
    .catch(e => console.error('[WS] No se pudo construir el índice de pares:', (e as Error).message));
}

// (Re)construye el índice par → activos a partir de asset_metadata: una
// consulta al arrancar o cuando cambian los activos, no una por tick.
export async function refreshPairIndex(): Promise<PairIndex> {
  const res = await db.query(
    `SELECT symbol, binance_eur_pair, binance_usdt_pair, binance_btc_pair, binance_eth_pair
     FROM asset_metadata
     WHERE price_source NOT IN ('fiat', 'unknown')`
  );
  pairIndex = buildPairIndex(res.rows as AssetPairsRow[]);
  return pairIndex;
}

// Procesa un mensaje miniTicker del stream combinado de Binance. Sin acceso a
// base de datos: resuelve el par contra el índice en memoria.
export function handleTickerMessage(raw: string): void {
  let msg: { data?: { s?: unknown; c?: unknown; o?: unknown } };
  try { msg = JSON.parse(raw); } catch { return; }

  const pair = typeof msg.data?.s === 'string' ? msg.data.s : null;
  const price = typeof msg.data?.c === 'string' ? parseFloat(msg.data.c) : NaN;
  const open = typeof msg.data?.o === 'string' ? parseFloat(msg.data.o) : NaN;
  if (!pair || !(price > 0)) return;

  if (pair === EURUSDT_PAIR) {
    eurUsdtRate = 1 / price;
    setLivePrice('USDT', eurUsdtRate);
    if (open > 0) { eurUsdtOpenRate = 1 / open; setOpen24Price('USDT', eurUsdtOpenRate); }
  }

  const updates = resolveTick(pairIndex, pair, price, {
    eurUsdtRate,
    btcEur: liveCache.get('BTC'),
    ethEur: liveCache.get('ETH'),
  });
  for (const [asset, priceEur] of updates) setLivePrice(asset, priceEur);

  // Apertura de 24h: misma conversión, con las referencias también de hace 24h
  // (el `o` de EURUSDT, BTC y ETH), para que ambos precios sean de la misma ventana.
  if (open > 0) {
    const openUpdates = resolveTick(pairIndex, pair, open, {
      eurUsdtRate: eurUsdtOpenRate ?? 0,
      btcEur: open24Cache.get('BTC'),
      ethEur: open24Cache.get('ETH'),
    });
    for (const [asset, openEur] of openUpdates) setOpen24Price(asset, openEur);
  }
}

// ── Conexión y suscripciones dinámicas (#149) ─────────────────────────────
// La URL se construye siempre con el índice vigente, también al reconectar:
// antes se fijaba al arrancar y los activos añadidos después no recibían
// precio en vivo hasta reiniciar el backend.
let feedRunning = false;
let connectionId = 0;
let currentStreamsKey = '';

function streamsKey(index: PairIndex): string {
  return streamPairs(index).sort().join(',');
}

function connectWebSocket(): void {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  const id = ++connectionId;
  currentStreamsKey = streamsKey(pairIndex);
  const streams = streamPairs(pairIndex).map(p => `${p.toLowerCase()}@miniTicker`).join('/');
  const socket = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
  ws = socket;

  socket.on('message', (data: Buffer) => handleTickerMessage(data.toString()));

  socket.on('close', () => {
    // Conexión sustituida por una resuscripción o feed detenido: no reconectar.
    if (id !== connectionId || !feedRunning) return;
    console.warn('[WS] Desconectado. Reconectando en 5s...');
    wsReconnectTimer = setTimeout(connectWebSocket, 5000);
  });

  socket.on('error', (err) => console.error('[WS] Error:', err.message));
}

let syncInFlight: Promise<void> | null = null;
let syncRequestedAgain = false;

// Recalcula los pares a partir de asset_metadata y, si han cambiado, sustituye
// la conexión de Binance por una con el conjunto vigente. Los activos que
// entran en el índice reciben un precio inmediato por REST, sin esperar al
// primer tick. Las llamadas concurrentes se agrupan en una sola ejecución más,
// como mucho.
export function syncLivePriceSubscriptions(): Promise<void> {
  if (syncInFlight) {
    syncRequestedAgain = true;
    return syncInFlight;
  }
  syncInFlight = (async () => {
    do {
      syncRequestedAgain = false;
      const before = indexedAssets(pairIndex);
      await loadPairCache();
      const index = await refreshPairIndex();

      if (feedRunning && streamsKey(index) !== currentStreamsKey) {
        const previous = ws;
        connectWebSocket();
        previous?.close();
      }

      const added = [...indexedAssets(index)].filter(a => !before.has(a));
      if (feedRunning && added.length > 0) await refreshLivePrices(added);
    } while (syncRequestedAgain);
  })().finally(() => { syncInFlight = null; });
  return syncInFlight;
}

// Versión "dispara y olvida" para rutas y procesos que modifican activos: no
// bloquea la respuesta y registra el error sin propagarlo.
export function requestLivePriceResync(): void {
  syncLivePriceSubscriptions().catch(e =>
    console.error('[WS] Error resincronizando suscripciones de precios:', (e as Error).message));
}

function indexedAssets(index: PairIndex): Set<string> {
  const assets = new Set<string>();
  for (const targets of index.values()) for (const { asset } of targets) assets.add(asset);
  return assets;
}

export function stopLivePrices(): void {
  feedRunning = false;
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  if (coinGeckoRefreshTimer) clearInterval(coinGeckoRefreshTimer);
  broadcaster.stop();
  open24Broadcaster.stop();
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
    const rows = symbols.flatMap(symbol => {
      const info = getPairInfo(symbol);
      return info ? [{
        symbol,
        binance_eur_pair: info.binanceEurPair, binance_usdt_pair: info.binanceUsdtPair,
        binance_btc_pair: info.binanceBtcPair, binance_eth_pair: info.binanceEthPair,
        price_source: info.priceSource,
      }] : [];
    });
    applyRestTickers(rows, await fetchMiniTickers(pairsToFetch));
  } catch { /* silencioso — se reintentará en el siguiente ciclo WebSocket */ }
}
