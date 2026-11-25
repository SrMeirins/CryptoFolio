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

export const CARD_TITLES = {
  invertido: 'Invertido', retirado: 'Retirado', ventas: 'Ventas', ingresos: 'Ingresos', comisiones: 'Comisiones',
} as const

export const COUNTERPART_LABELS = { fiat: 'A fiat', stablecoin: 'A stablecoin', cripto: 'A otra cripto' } as const

export const moneyIn = (v: Money, currency: Currency) => formatMoney(v[currency], currency)

/**
 * Operaciones que forman cada tarjeta del resumen (#553): los mismos recuentos
 * que usa el filtro de la tarjeta, así que el chip coincide con las filas que
 * muestra la lista al pulsarla.
 */
export function opsTarjeta(id: keyof typeof CARD_TITLES, totals: Pick<HistoryStats['totals'], 'fiat_buys' | 'withdrawn_ops' | 'sells' | 'income_ops' | 'fee_ops'>): number {
  switch (id) {
    case 'invertido': return totals.fiat_buys
    case 'retirado': return totals.withdrawn_ops
    case 'ventas': return totals.sells
    case 'ingresos': return totals.income_ops
    case 'comisiones': return totals.fee_ops
  }
}

const NOMBRES: Record<keyof typeof CARD_TITLES, { uno: string; varios: string; ninguno: string }> = {
  invertido: { uno: 'compra', varios: 'compras', ninguno: 'Ninguna' },
  retirado: { uno: 'retirada', varios: 'retiradas', ninguno: 'Ninguna' },
  ventas: { uno: 'venta', varios: 'ventas', ninguno: 'Ninguna' },
  ingresos: { uno: 'ingreso', varios: 'ingresos', ninguno: 'Ninguno' },
  comisiones: { uno: 'comisión', varios: 'comisiones', ninguno: 'Ninguna' },
}

/** Texto del chip: «12 compras», «1 retirada»; sin operaciones, «Ninguna» o «Ninguno». */
export function chipTarjeta(id: keyof typeof CARD_TITLES, n: number): string {
  const nombre = NOMBRES[id]
  return n === 0 ? nombre.ninguno : count(n, nombre.uno, nombre.varios)
}
