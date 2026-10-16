import type { OpenLot } from '../api/portfolio'

// Simulador de venta rediseñado (#280): atajos de cantidad, escenarios de
// precio y precios de la curva. Funciones puras.

export const QTY_PCTS = [25, 50, 75, 100] as const

/** Cantidad para un % de lo disponible en la wallet (redondeo sin ruido de coma flotante). */
export function qtyForPct(walletQty: number, pct: number): number {
  return +(walletQty * (pct / 100)).toPrecision(12)
}

/** % que representa una cantidad sobre lo disponible (0–100), para el deslizador. */
export function pctOfWallet(qty: number, walletQty: number): number {
  return walletQty > 0 ? Math.min(100, Math.max(0, (qty / walletQty) * 100)) : 0
}

/** Precio medio de compra de los lotes de una wallet (break-even sin comisión); null sin lotes. */
export function walletBreakEven(lots: readonly OpenLot[], walletId: string | undefined): number | null {
  let qty = 0, cost = 0
  for (const l of lots) {
    if (l.wallet_id !== walletId) continue
    qty += parseFloat(l.quantity_remaining)
    cost += parseFloat(l.cost_basis_eur)
  }
  return qty > 0 ? cost / qty : null
}

/**
 * Break-even de una venta concreta (#280): el precio al que vender esa
 * cantidad no da ganancia ni pérdida, con el coste de los lotes que se venden
 * en FIFO (no el medio de toda la wallet) y cubriendo la comisión.
 */
export function saleBreakEven(costBasisConsumed: number, quantity: number, feePct: number): number | null {
  if (!(quantity > 0) || !(costBasisConsumed > 0)) return null
  return costBasisConsumed / (quantity * (1 - Math.min(feePct, 99) / 100))
}

export interface PriceScenario { key: string; label: string; price: number }

/**
 * Escenarios de precio: actual, break-even de la venta (ver saleBreakEven),
 * +10 % y +25 % sobre el actual. Sin precio actual, solo el break-even.
 */
export function priceScenarios(current: number, breakEven: number | null): PriceScenario[] {
  const out: PriceScenario[] = []
  if (current > 0) out.push({ key: 'actual', label: 'Actual', price: current })
  if (breakEven !== null && breakEven > 0) out.push({ key: 'breakeven', label: 'Break-even', price: breakEven })
  if (current > 0) {
    out.push({ key: 'p10', label: '+10 %', price: current * 1.1 })
    out.push({ key: 'p25', label: '+25 %', price: current * 1.25 })
  }
  return out
}

/** Precios de la curva: de 0 a 2× el mayor de actual y break-even, en `steps` tramos. */
export function curvePrices(current: number, breakEven: number | null, steps = 40): number[] {
  const top = 2 * Math.max(current, breakEven ?? 0)
  if (!(top > 0)) return []
  return Array.from({ length: steps + 1 }, (_, i) => +((top * i) / steps).toPrecision(10))
}
