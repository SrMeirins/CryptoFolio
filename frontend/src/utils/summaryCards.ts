import { formatMoney, formatPercent, type Currency } from './format'

// Datos de la ayuda de las tarjetas de resumen del Dashboard (#210, #412).
// Funciones puras para que el texto sea el mismo en ambos temas y en EUR y USD.

/** «13 activos en cartera». */
export function costSecondary(assetCount: number): string {
  return `${assetCount} ${assetCount === 1 ? 'activo' : 'activos'} en cartera`
}

/** «Sobre X invertidos». */
export function returnSecondary(totalCost: number, currency: Currency): string {
  return `Sobre ${formatMoney(totalCost, currency)} invertidos`
}

// Chips de las cinco tarjetas KPI (#507): un único dato de contexto cada una.

/** Coste: «12 activos». */
export function costChip(assetCount: number): string {
  return `${assetCount} ${assetCount === 1 ? 'activo' : 'activos'}`
}

/**
 * Rentabilidad: la del día en vivo para el chip «Hoy» (la ventana la pone el
 * chip); `aria` es el nombre completo, «Hoy: +0,80 %». Null sin dato.
 */
export function todayPctChip(pct: number | null | undefined): { text: string; aria: string; tone: 'positive' | 'negative' | 'neutral' } | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null
  const r = Math.round(pct * 100) / 100
  const tone = r > 0 ? 'positive' : r < 0 ? 'negative' : 'neutral'
  const text = formatPercent(r, 2, true)
  return { text, aria: `Hoy: ${text}`, tone }
}

/** EUR neto: «Retirado 1.200,00 €» (el importe se oculta con la privacidad). */
export function withdrawnChip(withdrawn: number, currency: Currency): string {
  return `Retirado ${formatMoney(withdrawn, currency)}`
}
