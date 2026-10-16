import type { FifoLot } from '../api/portfolio'
import { formatPercent } from './format'

// Explicaciones de dos cifras correctas que confunden (#281).

export interface FxEffect {
  avgRate: number      // USD por EUR medio de compra (ponderado por coste)
  currentRate: number  // USD por EUR de hoy
  returnEur: number    // rentabilidad en EUR, %
  returnUsd: number    // rentabilidad en USD, %
  effectPp: number     // diferencia en puntos porcentuales (USD − EUR)
}

/**
 * Efecto del tipo de cambio en la rentabilidad en USD: el coste en USD usa el
 * tipo del día de compra de cada lote (#174) y el valor, el de hoy. Se calcula
 * sobre los lotes con precio, para aislar el efecto. Lotes sin tipo de compra:
 * con el de hoy (como la tabla). null sin datos suficientes.
 */
export function fxEffect(lots: readonly FifoLot[], pricesEur: Readonly<Record<string, number>>, usdPerEur: number | null): FxEffect | null {
  if (!usdPerEur || !(usdPerEur > 0)) return null
  let costEur = 0, costUsd = 0, valueEur = 0
  for (const l of lots) {
    const price = pricesEur[l.asset] ?? 0
    if (!(price > 0)) continue
    const cEur = parseFloat(l.cost_basis_eur)
    const cUsd = l.cost_basis_usd != null ? parseFloat(l.cost_basis_usd) : cEur * usdPerEur
    costEur += cEur
    costUsd += cUsd
    valueEur += parseFloat(l.quantity) * price
  }
  if (!(costEur > 0) || !(costUsd > 0)) return null
  const returnEur = (valueEur / costEur - 1) * 100
  const returnUsd = ((valueEur * usdPerEur) / costUsd - 1) * 100
  return { avgRate: costUsd / costEur, currentRate: usdPerEur, returnEur, returnUsd, effectPp: returnUsd - returnEur }
}

/**
 * Subida necesaria para recuperar una caída: las pérdidas y las recuperaciones
 * no son simétricas (tras caer un 50 %, hace falta subir un 100 %).
 */
export function recoveryNeeded(dropPct: number): number | null {
  const d = Math.abs(dropPct)
  return d > 0 && d < 100 ? (1 / (1 - d / 100) - 1) * 100 : null
}

/** «Tras caer un 10,0 %, hay que subir un 11,1 % para volver al punto de partida». */
export function recoveryText(dropPct: number): string | null {
  const up = recoveryNeeded(dropPct)
  return up === null ? null
    : `Tras caer un ${formatPercent(Math.abs(dropPct), 1)}, hay que subir un ${formatPercent(up, 1)} para volver al punto de partida: la subida se calcula sobre una base más baja.`
}
