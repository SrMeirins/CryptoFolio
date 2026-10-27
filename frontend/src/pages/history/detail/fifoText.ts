import type { ConsumptionRole, TransactionDetail } from '../../../api/portfolio'
import { amountsAreHidden, formatMoney } from '../../../utils/format'

// Textos de la trazabilidad FIFO del detalle (#405). Funciones puras.

export const ROLE_LABELS: Record<ConsumptionRole, string> = {
  traslado: 'Traslado', comision_red: 'Comisión de red', venta: 'Venta', permuta: 'Permuta', comision: 'Comisión',
  perdida: 'Pérdida', donacion: 'Donación', devolucion_margen: 'Devolución de margen', intereses_margen: 'Intereses de margen',
  otro: 'Otro',
}

/** Papel con su destino si es un traslado («Traslado a Fría»); `inline` lo pone en minúscula sin tocar el nombre de la wallet. */
export function roleText(role: ConsumptionRole, destination: string | null, inline = false): string {
  const name = inline ? ROLE_LABELS[role].charAt(0).toLowerCase() + ROLE_LABELS[role].slice(1) : ROLE_LABELS[role]
  return role === 'traslado' && destination ? `${name} a ${destination}` : name
}

const tiny = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumSignificantDigits: 2 })

/** Importe en EUR; por debajo de 0,01 € con 2 cifras significativas («0,004 €») en lugar de «0,00 €». */
export function preciseEur(v: number): string {
  if (!amountsAreHidden() && v !== 0 && Math.abs(v) < 0.01) return tiny.format(v)
  return formatMoney(v, 'EUR')
}

/** G/P con signo explícito. */
export function signedEur(v: number | null): string {
  if (v === null) return '—'
  return `${v > 0 ? '+' : ''}${preciseEur(v)}`
}

/** Fracción consumida de un lote (0 a 1). */
export function usedFraction(original: number | null, remaining: number | null): number {
  if (!original || original <= 0) return 0
  return Math.min(1, Math.max(0, 1 - (remaining ?? 0) / original))
}

const ARTICLE: Partial<Record<ConsumptionRole, string>> = { intereses_margen: 'los', otro: 'lo' }
const withArticle = (r: ConsumptionRole) => `${ARTICLE[r] ?? 'la'} ${ROLE_LABELS[r].toLowerCase()}`

/**
 * Qué causa el efecto fiscal, para el rótulo de los totales: «solo la comisión
 * de red» si además hay consumos sin efecto (un traslado); si no, los papeles
 * («la venta»). null si nada tiene efecto fiscal.
 */
export function fiscalCause(consumed: TransactionDetail['fifo']['consumed']): string | null {
  const roles = [...new Set(consumed.filter(c => c.fiscal_event_type !== 'NONE').map(c => c.role))]
  if (roles.length === 0) return null
  const text = roles.map(withArticle).join(' y ')
  return consumed.some(c => c.fiscal_event_type === 'NONE') ? `solo ${text}` : text
}
