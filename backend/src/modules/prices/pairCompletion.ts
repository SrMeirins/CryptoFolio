import { db } from '../../db/client';
import { fetchWithTimeout } from './httpTimeout';
import { loadPairCache } from './pairDetector';
import { requestLivePriceResync } from './liveFeed';

// Relleno de pares de Binance (#277): cada activo queda referenciado con todos
// sus pares existentes (EUR, USDT, BTC, ETH) para que el feed en vivo use el
// más líquido y tenga respaldo. La autodetección ya los busca todos para los
// activos nuevos; esto completa los antiguos y los precargados en el esquema,
// que solo tenían el par en EUR. Nunca vuelve a añadir un par que el usuario
// quitó a mano (disabled_pairs) ni cambia uno ya configurado.

export type QuoteKind = 'eur' | 'usdt' | 'btc' | 'eth';

const QUOTES: ReadonlyArray<[QuoteKind, string, string]> = [
  ['eur', 'EUR', 'binance_eur_pair'],
  ['usdt', 'USDT', 'binance_usdt_pair'],
  ['btc', 'BTC', 'binance_btc_pair'],
  ['eth', 'ETH', 'binance_eth_pair'],
];

const EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo?symbolStatus=TRADING';
const DAY_MS = 24 * 60 * 60_000;

export interface PairRow {
  symbol: string;
  binance_eur_pair: string | null;
  binance_usdt_pair: string | null;
  binance_btc_pair: string | null;
  binance_eth_pair: string | null;
  price_source: string;
  disabled_pairs: string[];
}

/** Pares que faltan a un activo y existen en Binance (y no están desactivados a mano). */
export function missingPairs(row: PairRow, trading: ReadonlySet<string>): Partial<Record<QuoteKind, string>> {
  const out: Partial<Record<QuoteKind, string>> = {};
  for (const [kind, quote, column] of QUOTES) {
    if (row.symbol === quote) continue;
    if ((row as unknown as Record<string, string | null>)[column]) continue;
    if (row.disabled_pairs.includes(kind)) continue;
    const pair = `${row.symbol}${quote}`;
    if (trading.has(pair)) out[kind] = pair;
  }
  return out;
}

/** Fuente de precio para un activo que no tenía ninguna y ahora tiene pares. */
function sourceFor(pairs: Partial<Record<QuoteKind, string>>): string | null {
  if (pairs.usdt) return 'usdt_proxy';
  if (pairs.eur) return 'eur_direct';
  if (pairs.btc) return 'btc_proxy';
  if (pairs.eth) return 'eth_proxy';
  return null;
}

/** Pares que se negocian ahora mismo en Binance (una sola consulta). */
export async function fetchTradingPairs(): Promise<Set<string>> {
  const res = await fetchWithTimeout(EXCHANGE_INFO_URL);
  if (!res.ok) throw new Error(`Binance exchangeInfo HTTP ${res.status}`);
  const data = await res.json() as { symbols?: Array<{ symbol?: unknown; status?: unknown }> };
  return new Set((data.symbols ?? [])
    .filter(s => s.status === 'TRADING' && typeof s.symbol === 'string')
    .map(s => s.symbol as string));
}

/**
 * Completa los pares que falten en asset_metadata. Devuelve cuántos activos
 * cambiaron; si alguno cambió, recarga la caché de pares y la suscripción del
 * feed en vivo. Nunca lanza: los fallos se registran y se reintenta más tarde.
 */
export async function completeAssetPairs(): Promise<number> {
  try {
    const trading = await fetchTradingPairs();
    if (trading.size === 0) return 0;
    const rows = (await db.query(
      `SELECT symbol, binance_eur_pair, binance_usdt_pair, binance_btc_pair, binance_eth_pair,
              price_source, disabled_pairs
       FROM asset_metadata
       WHERE price_source <> 'fiat'`,
    )).rows as PairRow[];

    let changed = 0;
    for (const row of rows) {
      const add = missingPairs(row, trading);
      if (Object.keys(add).length === 0) continue;
      await db.query(
        `UPDATE asset_metadata SET
           binance_eur_pair  = COALESCE(binance_eur_pair,  $2),
           binance_usdt_pair = COALESCE(binance_usdt_pair, $3),
           binance_btc_pair  = COALESCE(binance_btc_pair,  $4),
           binance_eth_pair  = COALESCE(binance_eth_pair,  $5),
           price_source      = CASE WHEN price_source = 'unknown' AND $6::text IS NOT NULL THEN $6 ELSE price_source END,
           last_price_check  = NOW()
         WHERE symbol = $1`,
        [row.symbol, add.eur ?? null, add.usdt ?? null, add.btc ?? null, add.eth ?? null, sourceFor(add)],
      );
      changed++;
    }
    if (changed > 0) {
      console.log(`[PRICES] Pares completados en ${changed} activo(s)`);
      await loadPairCache();
      requestLivePriceResync();
    }
    return changed;
  } catch (e) {
    console.warn('[PRICES] No se pudieron completar los pares:', (e as Error).message);
    return 0;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Relleno al arrancar y una vez al día. */
export function startPairCompletion(): void {
  void completeAssetPairs();
  if (!timer) timer = setInterval(() => { void completeAssetPairs(); }, DAY_MS);
}
