import type { HistoryStats } from '../../../api/portfolio'
import { formatMoney, formatNumber, type Currency } from '../../../utils/format'

// Textos del resumen del Historial (#403): líneas de las tarjetas y aviso del
// margen. Funciones puras.

type Money = { EUR: number; USD: number }

export const count = (n: number, one: string, many: string) => `${formatNumber(n, 0)} ${n === 1 ? one : many}`

/** Importe con signo explícito (G/P). */
export function signedMoney(v: number, currency: Currency): string {
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${formatMoney(Math.abs(v), currency)}`
}

/** Neto bajo Invertido; nada si no se ha recuperado fiat. */
export function netLine(totals: Pick<HistoryStats['totals'], 'invested' | 'recovered'>, currency: Currency): string | null {
  const recovered = totals.recovered[currency]
  if (recovered <= 0) return null
  return `Neto ${formatMoney(totals.invested[currency] - recovered, currency)} tras recuperar ${formatMoney(recovered, currency)}`
}

/** Aviso del margen: qué queda fuera o qué se incluye; nada si no hay margen. */
export function marginNotice(margin: HistoryStats['margin']): string | null {
  if (margin.ops === 0) return null
  const ventas = margin.sells > 0 ? `, ${count(margin.sells, 'de ellas venta', 'de ellas ventas')}` : ''
  return margin.included
    ? `Incluye ${count(margin.ops, 'operación de margen', 'operaciones de margen')}${ventas}.`
    : `Sin margen: ${count(margin.ops, 'operación queda fuera', 'operaciones quedan fuera')} del resumen${ventas}.`
}

export const COUNTERPART_LABELS = { fiat: 'A fiat', stablecoin: 'A stablecoin', cripto: 'A otra cripto' } as const

export const moneyIn = (v: Money, currency: Currency) => formatMoney(v[currency], currency)
