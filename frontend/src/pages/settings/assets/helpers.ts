import { fieldClasses } from '../../../components/ui/classes'
import { T } from '../../../utils/colors'
export const SOURCE_META: Record<string, { label: string; color: string }> = {
  // Tokens del tema (#444): siguen el modo claro u oscuro.
  eur_direct: { label: 'EUR directo', color: T.positive },
  usdt_proxy: { label: 'Vía USDT',    color: T.brand },
  btc_proxy:  { label: 'Vía BTC',     color: T.warning },
  eth_proxy:  { label: 'Vía ETH',     color: T.info },
  coingecko:  { label: 'CoinGecko',   color: T.purple },
  fiat:       { label: 'Estable',     color: T.muted },
  unknown:    { label: 'Sin precio',  color: T.negative },
}



// Compartido por AssetEditPanel y AddAssetDialog — antes declarado por
// duplicado e idéntico en ambos.
export const inputClass = fieldClasses('md', false, 'mono')

// ── Filtros por estado del precio (#337) ───────────────────────────────────
export type FiltroPrecio = 'todos' | 'sin_precio' | 'solo_coingecko' | 'respaldo'

export const FILTROS_PRECIO: readonly { value: FiltroPrecio; label: string; title: string }[] = [
  { value: 'todos', label: 'Todos', title: 'Todos los activos' },
  { value: 'sin_precio', label: 'Sin precio', title: 'Sin fuente de precio, o en cartera sin precio en vivo de ninguna fuente' },
  { value: 'solo_coingecko', label: 'Solo CoinGecko', title: 'Sin par en Binance: dependen de CoinGecko y, si falla, del respaldo' },
  { value: 'respaldo', label: 'Con respaldo', title: 'Su precio actual viene de CoinPaprika u OKX' },
]

interface ActivoPrecio {
  is_stablecoin: boolean
  price_source: string
  en_cartera?: boolean
  fuente_actual?: string | null
}

/** ¿Cumple el filtro? `precioVivo`: el del feed en vivo o el de la API. */
export function cumpleFiltro(a: ActivoPrecio, precioVivo: number | null | undefined, filtro: FiltroPrecio): boolean {
  if (filtro === 'todos') return true
  if (filtro === 'solo_coingecko') return a.price_source === 'coingecko'
  if (filtro === 'respaldo') return a.fuente_actual === 'coinpaprika' || a.fuente_actual === 'okx'
  if (a.is_stablecoin || a.price_source === 'fiat') return false
  return a.price_source === 'unknown' || (!!a.en_cartera && !(precioVivo && precioVivo > 0))
}
