import { db } from '../../db/client';
import { searchAndSaveCoinGeckoId } from './coingecko';

const REST_BASE = 'https://api.binance.com/api/v3';

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

export async function loadPairCache(): Promise<void> {
  const res = await db.query(
    `SELECT symbol, binance_eur_pair, binance_usdt_pair, binance_btc_pair,
            binance_eth_pair, price_source, is_stablecoin
     FROM asset_metadata`
  );
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

// Verificar si un par existe en Binance
async function pairExists(pair: string): Promise<boolean> {
  try {
    const res = await fetch(`${REST_BASE}/ticker/price?symbol=${pair}`);
    return res.ok;
  } catch {
    return false;
  }
}

// Auto-detectar el mejor par para un activo desconocido
export async function autoDetectPair(symbol: string): Promise<AssetPairInfo> {

  // Candidatos en orden de preferencia
  const eurPair  = `${symbol}EUR`;
  const usdtPair = `${symbol}USDT`;
  const btcPair  = `${symbol}BTC`;
  const ethPair  = `${symbol}ETH`;

  const info: AssetPairInfo = {
    symbol,
    binanceEurPair: null,
    binanceUsdtPair: null,
    binanceBtcPair: null,
    binanceEthPair: null,
    priceSource: 'unknown',
    isStablecoin: false,
  };

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

  // Guardar en DB y cache
  await upsertAssetMetadata(info, geckoId);
  pairCache.set(symbol, info);

  return info;
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
export async function getOrDetectPairInfo(symbol: string): Promise<AssetPairInfo> {
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

  // 3. Auto-detectar si no existe
  return autoDetectPair(symbol);
}

// Verificar manualmente un par específico (para la UI de Settings)
export async function testPair(pair: string): Promise<{ exists: boolean; price?: number }> {
  try {
    const res = await fetch(`${REST_BASE}/ticker/price?symbol=${pair}`);
    if (!res.ok) return { exists: false };
    const data = await res.json() as { price: string };
    return { exists: true, price: parseFloat(data.price) };
  } catch {
    return { exists: false };
  }
}
