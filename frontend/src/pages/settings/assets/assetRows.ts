import type { AssetMetadata } from '../../../api/portfolio'
import { cumpleFiltro, type FiltroPrecio } from './helpers'

// Tabla de Activos (#450): estado del precio de cada activo, resumen de salud,
// filtros y orden. Funciones puras; la tabla solo las pinta.

export type PriceState = 'binance' | 'coingecko' | 'respaldo' | 'sin-precio' | 'estable'

export const PRICE_STATE_LABEL: Record<PriceState, string> = {
  binance: 'En vivo',
  coingecko: 'CoinGecko',
  respaldo: 'Respaldo',
  'sin-precio': 'Sin precio',
  estable: 'Estable o fiat',
}

const isStable = (a: AssetMetadata) => a.is_stablecoin || a.price_source === 'fiat'

/** De dónde sale ahora el precio del activo; sin precio en vivo, «sin precio». */
export function priceState(a: AssetMetadata, livePrice: number | null | undefined): PriceState {
  if (isStable(a)) return 'estable'
  if (a.price_source === 'unknown' || !(livePrice && livePrice > 0)) return 'sin-precio'
  if (a.fuente_actual === 'coinpaprika' || a.fuente_actual === 'okx') return 'respaldo'
  if (a.fuente_actual === 'coingecko' || a.price_source === 'coingecko') return 'coingecko'
  return 'binance'
}

export interface PriceHealth {
  counts: Record<Exclude<PriceState, 'estable'>, number>
  /** Último fallo de precio de todos los activos; null si no hay ninguno. */
  lastFailure: { symbol: string; source: string; reason: string; at: string } | null
}

export function priceHealth(assets: readonly AssetMetadata[], priceOf: (a: AssetMetadata) => number | null | undefined): PriceHealth {
  const counts = { binance: 0, coingecko: 0, respaldo: 0, 'sin-precio': 0 }
  let lastFailure: PriceHealth['lastFailure'] = null
  for (const a of assets) {
    const s = priceState(a, priceOf(a))
    if (s !== 'estable') counts[s]++
    const f = a.ultimo_fallo
    if (f && (!lastFailure || f.at > lastFailure.at)) lastFailure = { symbol: a.symbol, ...f }
  }
  return { counts, lastFailure }
}

export type AssetFilter = FiltroPrecio | 'estables'

/** Filtro rápido: los de estado del precio (#337) y «Estables y fiat». */
export function matchesFilter(a: AssetMetadata, price: number | null | undefined, f: AssetFilter): boolean {
  if (f === 'estables') return isStable(a)
  return cumpleFiltro(a, price, f)
}

export type SortColumn = 'activo' | 'fuente' | 'precio' | 'estado' | 'uso'
export type SortDirection = 'asc' | 'desc'

const STATE_ORDER: PriceState[] = ['sin-precio', 'respaldo', 'coingecko', 'binance', 'estable']

/** Orden por columna; los empates, por símbolo. Sin precio va al final al ordenar por precio. */
export function sortAssets(list: readonly AssetMetadata[], col: SortColumn, dir: SortDirection, priceOf: (a: AssetMetadata) => number | null | undefined): AssetMetadata[] {
  const key = (a: AssetMetadata): number | string => {
    switch (col) {
      case 'activo': return a.symbol
      case 'fuente': return a.price_source
      case 'precio': return priceOf(a) ?? (dir === 'asc' ? Infinity : -Infinity)
      case 'estado': return STATE_ORDER.indexOf(priceState(a, priceOf(a)))
      case 'uso': return (a.en_cartera ? 1_000_000 : 0) + (a.operaciones ?? 0)
    }
  }
  return [...list].sort((x, y) => {
    const a = key(x), b = key(y)
    const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
    return (dir === 'asc' ? cmp : -cmp) || x.symbol.localeCompare(y.symbol)
  })
}
