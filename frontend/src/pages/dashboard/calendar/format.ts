import { formatMoney, formatPercent, HIDDEN_AMOUNT, type Currency } from '../../../utils/format'

// Formatos comunes del calendario de P&L.
export const signedMoney = (n: number, currency: Currency) => `${n > 0 ? '+' : ''}${formatMoney(n, currency)}`
export const signedPct = (n: number) => formatPercent(n, 2, true)
export const toneOf = (n: number) => (n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-fg-muted')

export function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const compacto = new Map<Currency, Intl.NumberFormat>()
/** Importe abreviado con signo para celdas estrechas (#512): «+850 €», «−1,2 mil €». Respeta los importes ocultos. */
export function signedCompact(n: number, currency: Currency): string {
  if (formatMoney(1, currency).includes(HIDDEN_AMOUNT)) return formatMoney(n, currency)
  let fmt = compacto.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 })
    compacto.set(currency, fmt)
  }
  const txt = fmt.format(Math.abs(n) < 0.5 ? 0 : n)
  return n >= 0.5 ? `+${txt}` : txt
}

/**
 * Importe mínimo para teselas estrechas (#512): sin moneda, con «k» desde mil
 * («+1,2k», «−85»). El exacto está en el nombre accesible y en el detalle. Con
 * los importes ocultos, «•••».
 */
export function signedTiny(n: number): string {
  if (formatMoney(1).includes(HIDDEN_AMOUNT)) return '•••'
  const abs = Math.abs(n)
  const signo = n >= 0.5 ? '+' : n <= -0.5 ? '−' : ''
  if (abs >= 1000) return `${signo}${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1).replace('.', ',')}k`
  return `${signo}${Math.round(abs)}`
}
