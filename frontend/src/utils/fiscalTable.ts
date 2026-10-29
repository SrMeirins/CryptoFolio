import { HIDDEN_AMOUNT, amountsAreHidden, formatNumber } from './format'
import { zonedFormat } from './zonedFormat'

// Tabla de operaciones de Fiscal (#295): tipos en castellano, fechas en hora
// de Madrid y cantidades sin notación científica. Funciones puras.

export type FiscalTone = 'sale' | 'swap' | 'fee' | 'loss' | 'margin' | 'other'

const TYPE_LABELS: Record<string, { label: string; tone: FiscalTone }> = {
  SELL:          { label: 'Venta',     tone: 'sale' },
  BUY:           { label: 'Permuta',   tone: 'swap' },
  FEE_EXCHANGE:  { label: 'Comisión',  tone: 'fee' },
  FEE_NETWORK:   { label: 'Comisión',  tone: 'fee' },
  FEE:           { label: 'Comisión',  tone: 'fee' },
  WITHDRAW:      { label: 'Comisión',  tone: 'fee' },
  LOST:          { label: 'Pérdida',   tone: 'loss' },
  GIFT_SENT:     { label: 'Donación',  tone: 'loss' },
  MARGIN_REPAY:  { label: 'Margen',    tone: 'margin' },
}

/** Tipo de operación fiscal en castellano con su tono de color. */
export function fiscalTypeLabel(tipo: string): { label: string; tone: FiscalTone } {
  return TYPE_LABELS[tipo] ?? { label: tipo, tone: 'other' }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/** «2026-01-01» (día de Madrid) → «1 ene 2026». */
export function formatFiscalDate(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (!m) return fecha
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

const DETAIL_DAY = () => zonedFormat('es-ES', { dateStyle: 'long' })
const DETAIL_TIME = () => zonedFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

/** Tooltip con la hora de Madrid: «1 de enero de 2026, 00:30». */
export function fiscalDateDetail(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  return `${DETAIL_DAY().format(d)}, ${DETAIL_TIME().format(d)}`
}

/** Cantidad sin notación científica: 3 cifras significativas por debajo de 0,01. Oculta en modo privacidad. */
export function formatFiscalQty(qty: number): string {
  if (!Number.isFinite(qty)) return '—'
  if (amountsAreHidden()) return HIDDEN_AMOUNT
  const abs = Math.abs(qty)
  if (abs === 0) return '0'
  if (abs >= 1000) return formatNumber(qty, 2)
  if (abs >= 1) return formatNumber(qty, 4, 4)
  if (abs >= 0.01) return formatNumber(qty, 6, 6)
  // Decimales justos para 3 cifras significativas, con tope de 12.
  const decimals = Math.min(12, Math.ceil(-Math.log10(abs)) + 2)
  return formatNumber(qty, decimals)
}
