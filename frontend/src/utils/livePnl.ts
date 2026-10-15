import type { LiveDayBase } from '../api/portfolio'
import type { Currency } from './format'
import { liveRate } from './displayMarket'

// P&L del día en curso con los precios en vivo (#213). Misma fórmula que el
// servidor (computeDailyPnl), aplicada en cada tick del WebSocket sobre la
// base que devuelve /pnl/daily: valor al cierre de ayer, tenencias actuales y
// flujos de capital de hoy.
//
//   P&L = V(ahora) − V(ayer) − (entradas − salidas)
//   %   = P&L / (V(ayer) + entradas)     (null si la base es < 1)
//
// Precio de cada activo: el del feed en vivo; si falta, el que usó el
// servidor. Un activo sin ninguno de los dos se excluye, como en el servidor.

export interface LiveDayPnl {
  value: number
  pnl: number
  pct: number | null
}

const MIN_BASE = 1

export function liveDayPnl(
  base: LiveDayBase,
  livePricesEur: Readonly<Record<string, number>>,
  currency: Currency,
): LiveDayPnl | null {
  const priceEur = (asset: string): number | null => {
    if (asset === 'EUR') return 1
    const live = livePricesEur[asset]
    if (live !== undefined && live > 0) return live
    const fallback = base.pricesEur[asset]
    return fallback !== undefined && fallback > 0 ? fallback : null
  }
  const usdt = priceEur('USDT')
  const rate = liveRate(currency, usdt === null ? {} : { USDT: usdt })
  if (rate === null) return null

  let valueEur = 0
  for (const [asset, qty] of Object.entries(base.holdings)) {
    const p = priceEur(asset)
    if (p !== null) valueEur += qty * p
  }
  let inflowEur = 0
  let outflowEur = 0
  for (const f of base.flows) {
    const p = priceEur(f.asset)
    if (p === null) continue
    if (f.quantity > 0) inflowEur += f.quantity * p
    else outflowEur += -f.quantity * p
  }

  const value = valueEur * rate
  const inflow = inflowEur * rate
  const pnl = value - base.previousValue - (inflow - outflowEur * rate)
  const denominator = base.previousValue + inflow
  return { value, pnl, pct: denominator >= MIN_BASE ? (pnl / denominator) * 100 : null }
}
