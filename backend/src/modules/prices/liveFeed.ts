import { db } from '../../db/client';
import { priceSourcesOffline } from './offlineMode';
import { precioActualRespaldo } from './respaldo/cascada';
import { recordPriceFailure } from './priceFailures';
import { PRICE_ALIASES } from './priceAliases';
import { WebSocket } from 'ws';
import { getOrDetectPairInfo, loadPairCache, getPairInfo } from './pairDetector';
import { getCurrentPricesEur, loadAssetMetadata as loadCoinGeckoIdMap } from './coingecko';
import { fetchWithTimeout } from './httpTimeout';
import { buildPairIndex, resolveTick, streamPairs, priceFromPairMap, pickSource, EURUSDT_PAIR, type AssetPairsRow, type PairIndex, type PairKind } from './livePairIndex';
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
  if (liveCache.get(symbol) !== price) {
    liveCache.set(symbol, price);
    broadcaster.queue(symbol, price);
  }
  // Alias (#337): BETH, WETH… valen lo mismo que su activo; su par puede estar
  // retirado (BETHETH en BREAK), así que se alimentan del precio del original.
  for (const [alias, original] of Object.entries(PRICE_ALIASES)) {
    if (original === symbol && liveCache.get(alias) !== price) {
      liveCache.set(alias, price);
      broadcaster.queue(alias, price);
    }
  }
}

// Fuente del precio en vivo de los activos que no vienen de Binance (#337).
const liveSources = new Map<string, 'coingecko' | 'coinpaprika' | 'okx'>();

/** Fuente del precio en vivo: Binance salvo que lo haya dado una fuente alternativa. */
export function getLiveSource(symbol: string): 'binance' | 'coingecko' | 'coinpaprika' | 'okx' | null {
  if (!liveCache.has(symbol)) return null;
  return liveSources.get(symbol) ?? 'binance';
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
  // Activos de solo CoinGecko que han recibido precio en este ciclo.
  const resueltos = new Set<string>();
  let soloCoinGecko: string[] = [];
  try {
    const res = await db.query(
      `SELECT symbol FROM asset_metadata WHERE price_source = 'coingecko'`
    );
    soloCoinGecko = (res.rows as { symbol: string }[]).map(r => r.symbol);
    if (soloCoinGecko.length > 0) {
      // getCurrentPricesEur solo resuelve símbolos con coingecko_id ya cargado
      // en memoria (coingeckoIds.ts) — nada más lo invocaba en el arranque real
      // del servidor, así que sin esto el mapa estaba siempre vacío y el
      // fallback no resolvía ningún precio. Recargarlo aquí (barato, una query)
      // también mantiene el mapa al día si el usuario edita el coingecko_id.
      await loadCoinGeckoIdMap();

      const prices = await getCurrentPricesEur(soloCoinGecko);
      for (const [symbol, price] of prices) {
        if (symbol === 'EUR') continue;
        setLivePrice(symbol, price);
        liveSources.set(symbol, 'coingecko');
        resueltos.add(symbol);
      }
    }
  } catch (e) {
    console.error('[PRICES] Error refrescando precios CoinGecko-only:', (e as Error).message);
  }
  // Último fallo por activo (#450): los de solo CoinGecko que se quedan sin precio en este ciclo.
  for (const symbol of soloCoinGecko) if (!resueltos.has(symbol)) recordPriceFailure(symbol, 'coingecko', 'sin-precio');
  // Tras CoinGecko (también si ha fallado): lo que siga sin precio, al respaldo (#337).
  await refrescarRespaldo(soloCoinGecko.filter(s => !resueltos.has(s)))
    .catch(e => console.error('[PRICES] Error en el respaldo de precios:', (e as Error).message));
}

// ── Respaldo de CoinGecko (#337) ────────────────────────────────────────────
// Se piden a CoinPaprika y, si no, a OKX: los activos de solo CoinGecko que no
// han recibido precio en este ciclo (fallo o 429), los que no tienen ningún
// precio en vivo (desconocidos, par retirado) y los que ya venían del respaldo.
// Una consulta cada 10 min por activo: la cuota de CoinPaprika es mensual
// (20.000) y este ciclo se repite cada minuto.
const RESPALDO_EN_VIVO_MS = 10 * 60_000;
const ultimoRespaldo = new Map<string, number>();

async function refrescarRespaldo(soloCoinGeckoSinPrecio: readonly string[]): Promise<void> {
  // Solo activos que se tienen (lotes abiertos): el catálogo trae muchos más.
  const res = await db.query(
    `SELECT am.symbol FROM asset_metadata am
     WHERE NOT am.is_stablecoin AND am.price_source <> 'fiat' AND am.symbol <> ALL($1::text[])
       AND EXISTS (SELECT 1 FROM fifo_lots fl WHERE fl.asset = am.symbol AND NOT fl.is_closed)`,
    [Object.keys(PRICE_ALIASES)],
  );
  const usdtEur = () => liveCache.get('USDT') ?? (eurUsdtRate > 0 ? eurUsdtRate : null);
  const pendientes = (res.rows as { symbol: string }[]).map(r => r.symbol).filter(symbol => {
    const fuente = liveSources.get(symbol);
    return soloCoinGeckoSinPrecio.includes(symbol) || !liveCache.has(symbol) || fuente === 'coinpaprika' || fuente === 'okx';
  });
  for (const symbol of pendientes) {
    const ultimo = ultimoRespaldo.get(symbol);
    if (ultimo !== undefined && liveCache.has(symbol) && Date.now() - ultimo < RESPALDO_EN_VIVO_MS) continue;
    ultimoRespaldo.set(symbol, Date.now());
    try {
      const r = await precioActualRespaldo(symbol, usdtEur);
      if (r) { setLivePrice(symbol, r.precio); liveSources.set(symbol, r.fuente); }
      else recordPriceFailure(symbol, 'coinpaprika', 'sin-precio');
    } catch (e) {
      console.warn(`[PRICES] Respaldo sin precio para ${symbol}:`, (e as Error).message);
      recordPriceFailure(symbol, 'coinpaprika', 'sin-respuesta');
    }
  }
}

// ── WebSocket: precios en tiempo real ─────────────────────────────────────
let ws: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Vigilancia de la conexión con Binance (#194). Una conexión puede quedarse
// abierta sin entregar datos (suspensión del equipo, corte breve de red, NAT
// que caduca) sin que llegue nunca el evento 'close': el feed quedaba
// congelado hasta reiniciar el backend. Se envía un ping periódico y, si en
// FEED_IDLE_MS no llega ningún mensaje ni pong, se termina la conexión para
// que se reconecte. Los reintentos fallidos esperan cada vez más.
const FEED_IDLE_MS = 60_000;
const PING_INTERVAL_MS = 20_000;
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;
let reconnectDelayMs = RECONNECT_BASE_MS;
let lastTickAt: number | null = null;
let coinGeckoRefreshTimer: ReturnType<typeof setInterval> | null = null;
let pairIndex: PairIndex = new Map();
// Último tick de cada par de cada activo (#277): decide qué par da el precio.
const sourceTicks = new Map<string, Partial<Record<PairKind, { at: number }>>>();

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
  // Modo sin red (#359): solo la carga inicial (que sin red se queda con la
  // caché); ni refrescos periódicos ni WebSocket de Binance.
  if (priceSourcesOffline()) {
    console.info('[PRICES] PRICE_SOURCES_OFFLINE activo: sin precios externos ni feed en vivo');
    void loadInitialPrices().catch(() => undefined);
    return;
  }
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

  // Cada activo recibe ticks de todos sus pares (#277); solo cambia su precio
  // el par elegido como fuente (el más líquido con datos recientes).
  const now = Date.now();
  const updates = resolveTick(pairIndex, pair, price, {
    eurUsdtRate,
    btcEur: liveCache.get('BTC'),
    ethEur: liveCache.get('ETH'),
  });
  for (const [asset, priceEur, kind] of updates) {
    const ticks = sourceTicks.get(asset) ?? {};
    ticks[kind] = { at: now };
    sourceTicks.set(asset, ticks);
    if (pickSource(ticks, now) === kind) setLivePrice(asset, priceEur);
  }

  // Apertura de 24h: misma conversión, con las referencias también de hace 24h
  // (el `o` de EURUSDT, BTC y ETH), para que ambos precios sean de la misma ventana.
  if (open > 0) {
    const openUpdates = resolveTick(pairIndex, pair, open, {
      eurUsdtRate: eurUsdtOpenRate ?? 0,
      btcEur: open24Cache.get('BTC'),
      ethEur: open24Cache.get('ETH'),
    });
    // La apertura de 24h, del mismo par que el precio: ambos de la misma fuente.
    for (const [asset, openEur, kind] of openUpdates) {
      if (pickSource(sourceTicks.get(asset) ?? {}, now) === kind) setOpen24Price(asset, openEur);
    }
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

  let lastActivity = Date.now();
  const markActivity = () => { lastActivity = Date.now(); };
  const heartbeat = setInterval(() => {
    if (id !== connectionId || !feedRunning) { clearInterval(heartbeat); return; }
    if (Date.now() - lastActivity >= FEED_IDLE_MS) {
      console.warn(`[WS] Sin datos de Binance en ${FEED_IDLE_MS / 1000}s: se reinicia la conexión`);
      clearInterval(heartbeat);
      socket.terminate();
      return;
    }
    try { socket.ping(); } catch { /* aún conectando: el siguiente intervalo lo reintenta */ }
  }, PING_INTERVAL_MS);

  socket.on('open', () => {
    markActivity();
    console.log(`[WS] Conectado a Binance (${currentStreamsKey.split(',').filter(Boolean).length} pares)`);
  });
  socket.on('pong', markActivity);
  socket.on('message', (data: Buffer) => {
    markActivity();
    lastTickAt = Date.now();
    reconnectDelayMs = RECONNECT_BASE_MS; // la conexión funciona: se reinicia la espera
    handleTickerMessage(data.toString());
  });

  socket.on('close', () => {
    clearInterval(heartbeat);
    // Conexión sustituida por una resuscripción o feed detenido: no reconectar.
    if (id !== connectionId || !feedRunning) return;
    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_MS);
    console.warn(`[WS] Desconectado. Reconectando en ${delay / 1000}s...`);
    wsReconnectTimer = setTimeout(connectWebSocket, delay);
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
// Reintento a mano desde Ajustes (#450): vuelve a pedir los precios de CoinGecko
// y del respaldo sin esperar al ciclo, como mucho una vez por minuto.
const RETRY_COOLDOWN_MS = 60_000;
let lastRetryAt = 0;
export async function retryPrices(): Promise<{ started: boolean; retryInMs: number }> {
  const wait = lastRetryAt + RETRY_COOLDOWN_MS - Date.now();
  if (wait > 0) return { started: false, retryInMs: wait };
  lastRetryAt = Date.now();
  ultimoRespaldo.clear();
  requestLivePriceResync();
  await refreshCoinGeckoOnlyPrices();
  return { started: true, retryInMs: RETRY_COOLDOWN_MS };
}

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

/** Estado del feed de Binance: instante del último mensaje recibido (null si aún no ha llegado ninguno). */
/**
 * Estado del feed para el indicador de la cabecera (#194, #200): último dato
 * recibido, pares suscritos en el stream de Binance y si la conexión está abierta.
 */
export function getFeedStatus(): { lastTickAt: number | null; pairs: number; binanceConnected: boolean } {
  return {
    lastTickAt,
    pairs: pairIndex.size > 0 ? streamPairs(pairIndex).length : 0,
    binanceConnected: ws?.readyState === WebSocket.OPEN,
  };
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
