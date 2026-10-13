import type { FifoLot } from '../api/portfolio'
import type { Currency } from './format'

// Conversión de los datos en vivo a la moneda de visualización (#177). Se hace
// en el cliente para que el cambio EUR ↔ USD sea instantáneo, sin pedir nada
// al backend:
//
// - Precios en vivo y de hace 24h: el feed los da en EUR e incluye USDT (EUR
//   por USDT), que se usa como referencia del dólar. Precio en USD = precio en
//   EUR ÷ precio de USDT del mismo momento.
// - Coste de los lotes: el backend ya lo devuelve en USD con el tipo de
//   apertura de cada lote; si faltara, se usa el tipo en vivo.
// - Saldos en EUR: se valoran al tipo en vivo (1 € = rate $).

type PriceMap = Readonly<Record<string, number>>

/** Unidades de la moneda por cada EUR, en vivo. 1 en EUR; null en USD si aún no hay precio de USDT. */
export function liveRate(currency: Currency, prices: PriceMap): number | null {
  if (currency === 'EUR') return 1
  const usdt = prices.USDT
  return usdt !== undefined && usdt > 0 ? 1 / usdt : null
}

function divideAll(map: PriceMap, divisor: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [asset, price] of Object.entries(map)) out[asset] = price / divisor
  return out
}

/** Precios en vivo en la moneda pedida. En USD sin precio de USDT: vacío (equivale a "sin precios aún"). */
export function convertPrices(prices: PriceMap, currency: Currency): PriceMap {
  if (currency === 'EUR') return prices
  const usdt = prices.USDT
  return usdt !== undefined && usdt > 0 ? divideAll(prices, usdt) : {}
}

/**
 * Precios de hace 24h en la moneda pedida: cada uno con el USDT de hace 24h,
 * para que la variación en USD incluya el movimiento del EUR/USD. Si falta el
 * USDT de hace 24h se usa el actual.
 */
export function convertOpen24(open24: PriceMap, prices: PriceMap, currency: Currency): PriceMap {
  if (currency === 'EUR') return open24
  const usdt = open24.USDT !== undefined && open24.USDT > 0 ? open24.USDT : prices.USDT
  return usdt !== undefined && usdt > 0 ? divideAll(open24, usdt) : {}
}

/**
 * Lotes con coste y precio medio en la moneda pedida. Conservan la forma de
 * FifoLot: en USD, `cost_basis_eur`/`avg_price_eur` pasan a contener dólares,
 * para que la valoración y la tabla de activos funcionen igual en ambas monedas.
 */
export function convertLots(lots: readonly FifoLot[], currency: Currency, rate: number | null): FifoLot[] {
  if (currency === 'EUR') return lots as FifoLot[]
  return lots.map(lot => ({
    ...lot,
    cost_basis_eur: usdOrLive(lot.cost_basis_usd, lot.cost_basis_eur, rate),
    avg_price_eur: usdOrLive(lot.avg_price_usd, lot.avg_price_eur, rate),
  }))
}

function usdOrLive(usd: string | null | undefined, eur: string, rate: number | null): string {
  if (usd !== null && usd !== undefined && usd !== '') return usd
  return rate === null ? '0' : String(parseFloat(eur) * rate)
}
