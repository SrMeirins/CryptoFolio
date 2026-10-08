import { db } from '../../db/client';
import { searchAndSaveCoinGeckoId } from './coingecko';
import { fetchWithTimeout } from './httpTimeout';

const REST_BASE = 'https://api.binance.com/api/v3';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export type PriceSource = 'eur_direct' | 'usdt_proxy' | 'btc_proxy' | 'eth_proxy' | 'fiat' | 'coingecko' | 'unknown';

export interface AssetPairInfo {
  symbol: string;
  binanceEurPair: string | null;
  binanceUsdtPair: string | null;
  binanceBtcPair: string | null;
  binanceEthPair: string | null;
  priceSource: PriceSource;
  isStablecoin: boolean;
}

// Cache en memoria para no consultar la DB en cada precio
const pairCache = new Map<string, AssetPairInfo>();

export interface DetectOptions {
  // false → un símbolo sin par en Binance ni en CoinGecko NO se registra en
  // asset_metadata. Lo usan las consultas públicas de solo lectura (p. ej.
  // GET /api/prices/historical), que no deben crear activos (#146). La
  // importación y las transacciones sí registran (por defecto true): son
  // posiciones reales que el usuario debe poder configurar en Ajustes.
  persistUnknown?: boolean;
}

// Símbolos desconocidos NO persistidos: caché negativa con caducidad para que
// repetir la consulta no relance 4 peticiones a Binance + búsqueda en CoinGecko.
const UNKNOWN_TTL_MS = 10 * 60_000;
const unknownCache = new Map<string, number>(); // símbolo → expira (epoch ms)

// Recarga completa desde asset_metadata: se vacía antes para que los pares
// editados o los activos borrados no queden con datos antiguos en memoria.
export async function loadPairCache(): Promise<void> {
  const res = await db.query(
    `SELECT symbol, binance_eur_pair, binance_usdt_pair, binance_btc_pair,
            binance_eth_pair, price_source, is_stablecoin
     FROM asset_metadata`
  );
  pairCache.clear();
  for (const row of res.rows) {
    pairCache.set(row.symbol, {
      symbol: row.symbol,
      binanceEurPair: row.binance_eur_pair,
      binanceUsdtPair: row.binance_usdt_pair,
      binanceBtcPair: row.binance_btc_pair,
      binanceEthPair: row.binance_eth_pair,
      priceSource: row.price_source,
      isStablecoin: row.is_stablecoin,
    });
  }
}

export function getPairInfo(symbol: string): AssetPairInfo | null {
  return pairCache.get(symbol) ?? null;
}

// Verificar si un par existe en Binance. Distingue "confirmado que no
// existe" (4xx real, ej. 400 símbolo inválido) de "no concluyente" (429
// rate-limit, 5xx, red/timeout) — antes CUALQUIER fallo se trataba como
// ausencia confirmada, así que un único fallo transitorio durante la
// auto-detección dejaba el activo con price_source incorrecto en BD para
// siempre (sin reintento posterior salvo borrar y re-crear el activo).
async function pairExists(pair: string, retries = 2): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(`${REST_BASE}/ticker/price?symbol=${pair}`);
      if (res.ok) return true;
      if (res.status !== 429 && res.status < 500) return false; // confirmado: símbolo inválido
      // 429/5xx: no concluyente, cae al reintento
    } catch {
      // red/timeout: no concluyente, cae al reintento
    }
    if (attempt < retries) await sleep(500 * attempt);
  }
  return false; // agotados los reintentos sin confirmación — fallback seguro: no existe
}

// Auto-detectar el mejor par para un activo desconocido
export async function autoDetectPair(
  symbol: string,
  { persistUnknown = true }: DetectOptions = {},
): Promise<AssetPairInfo> {

  // Candidatos en orden de preferencia
  const eurPair  = `${symbol}EUR`;
  const usdtPair = `${symbol}USDT`;
  const btcPair  = `${symbol}BTC`;
  const ethPair  = `${symbol}ETH`;

  const info = unknownPairInfo(symbol);

  // Probar en paralelo
  const [hasEur, hasUsdt, hasBtc, hasEth] = await Promise.all([
    pairExists(eurPair),
    pairExists(usdtPair),
    pairExists(btcPair),
    pairExists(ethPair),
  ]);

  if (hasEur) {
    info.binanceEurPair = eurPair;
    info.priceSource = 'eur_direct';
  }
  if (hasUsdt) {
    info.binanceUsdtPair = usdtPair;
    if (info.priceSource === 'unknown') info.priceSource = 'usdt_proxy';
  }
  if (hasBtc) {
    info.binanceBtcPair = btcPair;
    if (info.priceSource === 'unknown') info.priceSource = 'btc_proxy';
  }
  if (hasEth) {
    info.binanceEthPair = ethPair;
    if (info.priceSource === 'unknown') info.priceSource = 'eth_proxy';
  }

  // Fallback a CoinGecko si no hay ningún par en Binance
  let geckoId: string | null = null;
  if (info.priceSource === 'unknown') {
    const geckoInDb = await db.query(
      'SELECT coingecko_id FROM asset_metadata WHERE symbol = $1 AND coingecko_id IS NOT NULL',
      [symbol]
    );
    geckoId = geckoInDb.rows[0]?.coingecko_id ?? await searchAndSaveCoinGeckoId(symbol);
    if (geckoId) info.priceSource = 'coingecko';
  }

  if (info.priceSource === 'unknown' && !persistUnknown) {
    unknownCache.set(symbol, Date.now() + UNKNOWN_TTL_MS);
    return info;
  }

  // Guardar en DB y cache
  await upsertAssetMetadata(info, geckoId);
  pairCache.set(symbol, info);
  unknownCache.delete(symbol);

  return info;
}

function unknownPairInfo(symbol: string): AssetPairInfo {
  return {
    symbol,
    binanceEurPair: null,
    binanceUsdtPair: null,
    binanceBtcPair: null,
    binanceEthPair: null,
    priceSource: 'unknown',
    isStablecoin: false,
  };
}

async function upsertAssetMetadata(info: AssetPairInfo, geckoId: string | null = null): Promise<void> {
  await db.query(
    `INSERT INTO asset_metadata (
      symbol, name, coingecko_id, is_stablecoin,
      binance_eur_pair, binance_usdt_pair, binance_btc_pair, binance_eth_pair,
      price_source, auto_detected, last_price_check
    ) VALUES ($1, $2, $9, $3, $4, $5, $6, $7, $8, TRUE, NOW())
    ON CONFLICT (symbol) DO UPDATE SET
      binance_eur_pair  = EXCLUDED.binance_eur_pair,
      binance_usdt_pair = EXCLUDED.binance_usdt_pair,
      binance_btc_pair  = EXCLUDED.binance_btc_pair,
      binance_eth_pair  = EXCLUDED.binance_eth_pair,
      price_source      = EXCLUDED.price_source,
      coingecko_id      = COALESCE(EXCLUDED.coingecko_id, asset_metadata.coingecko_id),
      auto_detected     = TRUE,
      last_price_check  = NOW()`,
    [
      info.symbol,
      info.symbol,
      info.isStablecoin,
      info.binanceEurPair,
      info.binanceUsdtPair,
      info.binanceBtcPair,
      info.binanceEthPair,
      info.priceSource,
      geckoId,
    ]
  );
}

// Obtener o auto-detectar info de un activo
export async function getOrDetectPairInfo(symbol: string, options: DetectOptions = {}): Promise<AssetPairInfo> {
  // 1. Cache en memoria
  const cached = pairCache.get(symbol);
  if (cached) return cached;

  // 2. DB
  const res = await db.query(
    `SELECT symbol, binance_eur_pair, binance_usdt_pair, binance_btc_pair,
            binance_eth_pair, price_source, is_stablecoin
     FROM asset_metadata WHERE symbol = $1`,
    [symbol]
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    const info: AssetPairInfo = {
      symbol: row.symbol,
      binanceEurPair: row.binance_eur_pair,
      binanceUsdtPair: row.binance_usdt_pair,
      binanceBtcPair: row.binance_btc_pair,
      binanceEthPair: row.binance_eth_pair,
      priceSource: row.price_source,
      isStablecoin: row.is_stablecoin,
    };
    pairCache.set(symbol, info);
    return info;
  }

  // 3. Auto-detectar si no existe (salvo símbolo desconocido consultado hace poco)
  const unknownUntil = unknownCache.get(symbol);
  if (options.persistUnknown === false && unknownUntil !== undefined && unknownUntil > Date.now()) {
    return unknownPairInfo(symbol);
  }
  return autoDetectPair(symbol, options);
}

// Verificar manualmente un par específico (para la UI de Settings)
export async function testPair(pair: string): Promise<{ exists: boolean; price?: number }> {
  try {
    const res = await fetchWithTimeout(`${REST_BASE}/ticker/price?symbol=${pair}`);
    if (!res.ok) return { exists: false };
    const data = await res.json() as { price: string };
    return { exists: true, price: parseFloat(data.price) };
  } catch {
    return { exists: false };
  }
}
