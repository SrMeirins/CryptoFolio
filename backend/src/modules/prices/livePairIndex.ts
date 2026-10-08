// Índice en memoria par de Binance → activos que toman su precio en vivo de
// ese par. Sustituye a la consulta SQL que se hacía por cada mensaje del
// WebSocket (#148): la correspondencia par → activo solo cambia cuando cambia
// asset_metadata, así que se construye una vez y se reconstruye a demanda.

export type PairKind = 'eur' | 'usdt' | 'btc' | 'eth';

export interface PairTarget {
  asset: string;
  kind: PairKind;
}

export interface AssetPairsRow {
  symbol: string;
  binance_eur_pair: string | null;
  binance_usdt_pair: string | null;
  binance_btc_pair: string | null;
  binance_eth_pair: string | null;
}

export type PairIndex = ReadonlyMap<string, readonly PairTarget[]>;

export interface LiveRates {
  eurUsdtRate: number;        // EUR por 1 USDT
  btcEur: number | undefined; // precio en vivo de BTC en EUR
  ethEur: number | undefined; // precio en vivo de ETH en EUR
}

// Par de referencia para convertir a EUR; siempre suscrito.
export const EURUSDT_PAIR = 'EURUSDT';

// Cada activo usa solo su par preferido (EUR > USDT > BTC > ETH), la misma
// prioridad que la carga inicial por REST. Antes se suscribían todos sus pares
// y cada tick sobrescribía el precio con la conversión de ese par, de modo que
// un activo con varios pares alternaba entre fuentes.
function preferredPair(row: AssetPairsRow): { pair: string; kind: PairKind } | null {
  if (row.binance_eur_pair)  return { pair: row.binance_eur_pair.toUpperCase(),  kind: 'eur' };
  if (row.binance_usdt_pair) return { pair: row.binance_usdt_pair.toUpperCase(), kind: 'usdt' };
  if (row.binance_btc_pair)  return { pair: row.binance_btc_pair.toUpperCase(),  kind: 'btc' };
  if (row.binance_eth_pair)  return { pair: row.binance_eth_pair.toUpperCase(),  kind: 'eth' };
  return null;
}

export function buildPairIndex(rows: readonly AssetPairsRow[]): PairIndex {
  const index = new Map<string, PairTarget[]>();
  const indexed = new Set<string>();
  let needsBtc = false;
  let needsEth = false;

  const add = (pair: string, target: PairTarget) => {
    const list = index.get(pair) ?? [];
    list.push(target);
    index.set(pair, list);
    indexed.add(target.asset);
  };

  for (const row of rows) {
    const preferred = preferredPair(row);
    if (!preferred) continue;
    add(preferred.pair, { asset: row.symbol, kind: preferred.kind });
    if (preferred.kind === 'btc') needsBtc = true;
    if (preferred.kind === 'eth') needsEth = true;
  }

  // Los activos cotizados contra BTC/ETH necesitan el precio en EUR de la
  // moneda de referencia aunque esta no esté registrada como activo.
  if (needsBtc && !indexed.has('BTC')) add('BTCEUR', { asset: 'BTC', kind: 'eur' });
  if (needsEth && !indexed.has('ETH')) add('ETHEUR', { asset: 'ETH', kind: 'eur' });

  return index;
}

// Pares a los que suscribirse en el WebSocket de Binance.
export function streamPairs(index: PairIndex): string[] {
  return [EURUSDT_PAIR, ...[...index.keys()].filter(p => p !== EURUSDT_PAIR)];
}

// Convierte un tick de un par en los precios en EUR de los activos asociados.
// Devuelve una lista vacía si el par no está indexado o falta la referencia
// necesaria (p. ej. un par BTC antes de conocer el precio de BTC).
export function resolveTick(
  index: PairIndex,
  pair: string,
  price: number,
  rates: LiveRates,
): Array<[asset: string, priceEur: number]> {
  const targets = index.get(pair);
  if (!targets || !(price > 0)) return [];

  const result: Array<[string, number]> = [];
  for (const { asset, kind } of targets) {
    let priceEur: number | undefined;
    if (kind === 'eur') priceEur = price;
    else if (kind === 'usdt') priceEur = price * rates.eurUsdtRate;
    else if (kind === 'btc' && rates.btcEur) priceEur = price * rates.btcEur;
    else if (kind === 'eth' && rates.ethEur) priceEur = price * rates.ethEur;
    if (priceEur !== undefined && priceEur > 0) result.push([asset, priceEur]);
  }
  return result;
}
