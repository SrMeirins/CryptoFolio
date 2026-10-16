import type { FifoLot, FiatBalance } from '../api/portfolio'
import { buildRows, type UnifiedRow } from './assetTable'
import { isDust } from './portfolioSections'

// Vista «Por activo» de Portfolio y filtros de la tabla (#271). Funciones puras.

export type PortfolioView = 'asset' | 'wallet'
export type PnlFilter = 'all' | 'gain' | 'loss'

/**
 * Distancia del precio actual al break-even (precio medio de compra), en %:
 * positiva si el precio está por encima (en beneficio), negativa si está por
 * debajo. `toRecover` es la subida necesaria para recuperar lo invertido.
 * null sin precio o sin coste.
 */
export function breakEvenDistance(price: number, avgPrice: number): { pct: number; toRecover: number } | null {
  if (!(price > 0) || !(avgPrice > 0)) return null
  return { pct: (price / avgPrice - 1) * 100, toRecover: Math.max(0, (avgPrice / price - 1) * 100) }
}

/** Una fila por activo con todas sus wallets; el polvo se decide sobre el total del activo. */
export function assetView(
  lots: readonly FifoLot[],
  prices: Readonly<Record<string, number>>,
  fiats: readonly FiatBalance[],
  fiatPrice: number,
  dustThreshold: number,
): { rows: UnifiedRow[]; dust: UnifiedRow[]; dustValue: number } {
  const all = buildRows([...lots], prices, [...fiats], fiatPrice)
  const dust = all.filter(r => isDust(r, prices, dustThreshold))
  return { rows: all.filter(r => !isDust(r, prices, dustThreshold)), dust, dustValue: dust.reduce((s, r) => s + r.value, 0) }
}

/** P&L no realizado de una fila; null si no se puede calcular (fiat o sin precio). */
export function rowPnl(row: UnifiedRow, prices: Readonly<Record<string, number>>): number | null {
  if (row.kind !== 'crypto' || !((prices[row.asset] ?? 0) > 0)) return null
  return row.value - row.totalCostBasis
}

/** Filtro «En ganancia» / «En pérdida»: las filas sin P&L calculable solo aparecen con «Todos». */
export function filterByPnl(rows: readonly UnifiedRow[], filter: PnlFilter, prices: Readonly<Record<string, number>>): UnifiedRow[] {
  if (filter === 'all') return [...rows]
  return rows.filter(r => {
    const pnl = rowPnl(r, prices)
    return pnl !== null && (filter === 'gain' ? pnl > 0 : pnl < 0)
  })
}
