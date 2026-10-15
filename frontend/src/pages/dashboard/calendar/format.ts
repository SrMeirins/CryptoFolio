import { formatMoney, formatPercent, type Currency } from '../../../utils/format'

// Formatos comunes del calendario de P&L.
export const signedMoney = (n: number, currency: Currency) => `${n > 0 ? '+' : ''}${formatMoney(n, currency)}`
export const signedPct = (n: number) => formatPercent(n, 2, true)
export const toneOf = (n: number) => (n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-fg-muted')

export function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
