import type { UnifiedRow } from './assetTable'
import { sanitizeCsvField } from './csvSafety'

// Tabla de posiciones de Portfolio (#282): totales del pie, exportación a CSV,
// serie del mini-gráfico y navegación con teclado. Funciones puras.

export interface TableTotals { value: number; cost: number; pnl: number; pnlPct: number | null; weightPct: number }

/**
 * Totales de las filas visibles. P&L y coste, solo de las posiciones cripto
 * con precio (como cada fila); el valor y el peso incluyen también el fiat.
 */
export function tableTotals(rows: readonly UnifiedRow[], prices: Readonly<Record<string, number>>, portfolioTotal: number): TableTotals {
  let value = 0, cost = 0, pnlValue = 0
  for (const r of rows) {
    value += r.value
    if (r.kind === 'crypto' && (prices[r.asset] ?? 0) > 0) {
      cost += r.totalCostBasis
      pnlValue += r.value
    }
  }
  const pnl = pnlValue - cost
  return { value, cost, pnl, pnlPct: cost > 0 ? (pnl / cost) * 100 : null, weightPct: portfolioTotal > 0 ? (value / portfolioTotal) * 100 : 0 }
}

const num = (n: number | null, decimals = 8) => (n === null || !Number.isFinite(n) ? '' : String(+n.toFixed(decimals)))

/** CSV (separador ';', números sin formato) de las posiciones visibles, en la moneda elegida. */
export function buildPositionsCsv(rows: readonly UnifiedRow[], prices: Readonly<Record<string, number>>, portfolioTotal: number, currency: string): string {
  const header = ['Activo', 'Wallets', 'Cantidad', `Precio (${currency})`, `Valor (${currency})`, `Coste (${currency})`, `P&L (${currency})`, 'P&L %', '% cartera'].join(';')
  const lines = rows.map(r => {
    const wallets = sanitizeCsvField(r.wallets.map(w => w.wallet_name).join(' | '))
    const weight = portfolioTotal > 0 ? (r.value / portfolioTotal) * 100 : null
    if (r.kind === 'fiat') {
      return [sanitizeCsvField(r.asset), wallets, num(r.quantity), num(r.price), num(r.value, 2), '', '', '', num(weight, 2)].join(';')
    }
    const price = prices[r.asset] ?? 0
    const pnl = price > 0 ? r.value - r.totalCostBasis : null
    const pnlPct = pnl !== null && r.totalCostBasis > 0 ? (pnl / r.totalCostBasis) * 100 : null
    return [
      sanitizeCsvField(r.asset), wallets, num(r.totalQuantity), price > 0 ? num(price) : '', price > 0 ? num(r.value, 2) : '',
      num(r.totalCostBasis, 2), num(pnl, 2), num(pnlPct, 2), price > 0 ? num(weight, 2) : '',
    ].join(';')
  })
  return [header, ...lines].join('\n')
}

/** Serie del mini-gráfico: cierres en EUR + precio en vivo como último punto, en la moneda elegida. */
export function sparkSeries(closesEur: ReadonlyArray<{ price: number }>, livePriceEur: number | undefined, eurToDisplay: number): number[] {
  const out = closesEur.map(c => c.price * eurToDisplay)
  if (livePriceEur && livePriceEur > 0) out.push(livePriceEur * eurToDisplay)
  return out
}

/** Fila destino al pulsar ↑/↓/Inicio/Fin; null si la tecla no navega. */
export function nextRowIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null
  if (key === 'ArrowDown') return Math.min(count - 1, index + 1)
  if (key === 'ArrowUp') return Math.max(0, index - 1)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}
