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

// Prioridad de los pares para el precio en vivo (#277): primero el más
// líquido. Los pares en EUR se negocian poco y Binance solo emite cuando hay
// operaciones, así que con EUR primero muchos precios parecían congelados.
export const PAIR_PRIORITY: readonly PairKind[] = ['usdt', 'eur', 'btc', 'eth'];

// Un par sin datos durante este tiempo cede el paso al siguiente que sí los tenga.
export const PAIR_STALE_MS = 15_000;

/** Pares de un activo con su tipo, en orden de prioridad. */
function assetPairs(row: AssetPairsRow): Array<{ pair: string; kind: PairKind }> {
  const byKind: Record<PairKind, string | null> = {
    usdt: row.binance_usdt_pair, eur: row.binance_eur_pair, btc: row.binance_btc_pair, eth: row.binance_eth_pair,
  };
  return PAIR_PRIORITY.flatMap(kind => (byKind[kind] ? [{ pair: byKind[kind]!.toUpperCase(), kind }] : []));
}

/**
 * Fuente del precio en vivo de un activo (#277): el par de mayor prioridad
 * con datos en los últimos PAIR_STALE_MS; si ninguno es reciente, el que
 * emitió por última vez. Así un activo nunca se queda sin precio y, mientras
 * su par preferido emita, no alterna entre fuentes (cada tick de otro par se
 * guarda, pero no cambia el precio).
 */
export function pickSource(ticks: Partial<Record<PairKind, { at: number }>>, now: number, staleMs = PAIR_STALE_MS): PairKind | null {
  for (const kind of PAIR_PRIORITY) {
    const t = ticks[kind];
    if (t && now - t.at <= staleMs) return kind;
  }
  let latest: PairKind | null = null;
  for (const kind of PAIR_PRIORITY) {
    const t = ticks[kind];
    if (t && (latest === null || t.at > ticks[latest]!.at)) latest = kind;
  }
  return latest;
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

  // Todos los pares de cada activo (#277): el feed elige la fuente con pickSource.
  for (const row of rows) {
    for (const { pair, kind } of assetPairs(row)) {
      add(pair, { asset: row.symbol, kind });
      if (kind === 'btc') needsBtc = true;
      if (kind === 'eth') needsEth = true;
    }
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
): Array<[asset: string, priceEur: number, kind: PairKind]> {
  const targets = index.get(pair);
  if (!targets || !(price > 0)) return [];

  const result: Array<[string, number, PairKind]> = [];
  for (const { asset, kind } of targets) {
    let priceEur: number | undefined;
    if (kind === 'eur') priceEur = price;
    else if (kind === 'usdt') priceEur = price * rates.eurUsdtRate;
    else if (kind === 'btc' && rates.btcEur) priceEur = price * rates.btcEur;
    else if (kind === 'eth' && rates.ethEur) priceEur = price * rates.ethEur;
    if (priceEur !== undefined && priceEur > 0) result.push([asset, priceEur, kind]);
  }
  return result;
}

// Precio en EUR de un activo a partir de un mapa par → precio obtenido por
// REST (carga inicial, activos nuevos), con la misma prioridad que el
// WebSocket (#277). Sirve igual para el último precio y para el de apertura de 24h.
export function priceFromPairMap(
  row: AssetPairsRow,
  prices: ReadonlyMap<string, number>,
  rates: LiveRates,
): number | null {
  const at = (pair: string | null) => (pair ? prices.get(pair.toUpperCase()) : undefined);
  const candidates: Array<number | undefined> = [
    mul(at(row.binance_usdt_pair), rates.eurUsdtRate),
    at(row.binance_eur_pair),
    mul(at(row.binance_btc_pair), rates.btcEur),
    mul(at(row.binance_eth_pair), rates.ethEur),
  ];
  const found = candidates.find(p => p !== undefined && p > 0);
  return found ?? null;
}

function mul(a: number | undefined, b: number | undefined): number | undefined {
  return a !== undefined && b !== undefined ? a * b : undefined;
}
