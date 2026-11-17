import type { SimulationResult } from '../api/portfolio'

// «Si vendo X» del panel de detalle (#528). El cálculo es el del simulador de
// venta (POST /fiscal/simulate-sale, FIFO global y misma comisión), así que el
// resultado coincide por construcción; aquí solo se resume para el panel.

export const QUICK_SHARES = [25, 50, 100] as const

/** Cantidad para un porcentaje de la posición, sin pasarse por redondeo. */
export function shareQuantity(total: number, pct: number): number {
  if (!(total > 0)) return 0
  return pct >= 100 ? total : (total * pct) / 100
}

/** Texto del campo de cantidad: número válido, mayor que 0 y como mucho la posición. */
export function parseSellQuantity(raw: string, max: number): number | null {
  const n = Number(raw.trim().replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(n, max)
}

export interface SiVendoResumen {
  /** Ids de los lotes que saldrían (para resaltarlos en la lista). */
  lotIds: Set<string>
  lots: number
  partial: boolean
  firstOpenedAt: string | null
  lastOpenedAt: string | null
  proceedsEur: number
  costEur: number
  feeEur: number
  resultEur: number
}

export function siVendoResumen(r: SimulationResult): SiVendoResumen {
  const consumed = r.lotsConsumed.filter(l => l.qtyConsumed > 0)
  return {
    lotIds: new Set(consumed.map(l => l.lotId)),
    lots: consumed.length,
    partial: consumed.some(l => l.partial),
    firstOpenedAt: consumed[0]?.openedAt ?? null,
    lastOpenedAt: consumed.at(-1)?.openedAt ?? null,
    proceedsEur: r.totalProceeds,
    costEur: r.totalCostBasis,
    feeEur: r.totalFee,
    resultEur: r.netGainLoss,
  }
}
