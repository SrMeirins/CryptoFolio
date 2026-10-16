import type { OpenLot } from '../api/portfolio'
import type { Currency } from './format'

// Lotes FIFO de un activo para el panel de detalle de Portfolio (#272).
// Funciones puras: importes en la moneda de visualización, P&L por lote,
// antigüedad y el próximo lote que se vendería en cada wallet.

export interface LotView {
  walletId: string
  walletName: string
  walletColor: string
  openedAt: string
  quantity: number          // restante
  quantityOriginal: number
  partial: boolean          // ya se vendió una parte
  unitCost: number          // precio de compra por unidad
  cost: number              // coste del restante
  value: number             // restante al precio actual
  pnl: number | null        // null sin precio actual
  pnlPct: number | null
  ageDays: number
  next: boolean             // el primero que se vendería en su wallet
  source: string
}

/**
 * En USD, el coste se convierte con el tipo de la fecha de apertura del lote
 * (como la tabla, #174); si el lote no lo tiene, con el tipo en vivo.
 */
function toDisplay(eur: number, usdPerEur: string | null, currency: Currency, liveRate: number | null): number {
  if (currency === 'EUR') return eur
  const rate = usdPerEur !== null ? parseFloat(usdPerEur) : liveRate
  return rate !== null && rate > 0 ? eur * rate : eur
}

export function lotsView(lots: readonly OpenLot[], price: number, currency: Currency, liveRate: number | null, now: Date = new Date()): LotView[] {
  const seen = new Set<string>()
  return lots.map(l => {
    const quantity = parseFloat(l.quantity_remaining)
    const quantityOriginal = parseFloat(l.quantity_original)
    const cost = toDisplay(parseFloat(l.cost_basis_eur), l.usd_per_eur, currency, liveRate)
    const value = quantity * price
    const pnl = price > 0 ? value - cost : null
    const next = !seen.has(l.wallet_id)
    seen.add(l.wallet_id)
    return {
      walletId: l.wallet_id,
      walletName: l.wallet_name,
      walletColor: l.wallet_color,
      openedAt: l.opened_at,
      quantity,
      quantityOriginal,
      partial: quantity < quantityOriginal - 1e-9,
      unitCost: toDisplay(parseFloat(l.price_per_unit_eur), l.usd_per_eur, currency, liveRate),
      cost,
      value,
      pnl,
      pnlPct: pnl !== null && cost > 0 ? (pnl / cost) * 100 : null,
      ageDays: Math.max(0, Math.floor((now.getTime() - Date.parse(l.opened_at)) / 86_400_000)),
      next,
      source: l.source_type,
    }
  })
}

/** «12 d», «5 m», «2 a 3 m»: antigüedad compacta de un lote. */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Antigüedad de un lote en palabras (#289): «Hoy», «Hace 5 días», «Hace 1 año y 6 meses». */
export function formatAge(days: number): string {
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 31) return `Hace ${days} días`
  // Meses exactos del año (365 / 12 días); el margen evita que 365 días den 11 meses por redondeo.
  const months = Math.floor((days * 12) / 365 + 1e-9)
  if (months < 12) return `Hace ${plural(months, 'mes', 'meses')}`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return `Hace ${plural(years, 'año', 'años')}${rest > 0 ? ` y ${plural(rest, 'mes', 'meses')}` : ''}`
}

/** Días completos transcurridos desde una fecha (ms); null si no la hay. */
export function daysSince(ms: number | null, now: Date = new Date()): number | null {
  return ms === null ? null : Math.max(0, Math.floor((now.getTime() - ms) / 86_400_000))
}

const LOT_DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' })
const LOT_DAY_LONG = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'Europe/Madrid' })
const LOT_TIME = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })

/** Fecha de apertura con el año completo: «9 abr 2025». */
export function formatLotDate(iso: string): string {
  return LOT_DATE.format(new Date(iso)).replace('.', '')
}

/** Detalle del tooltip: «9 de abril de 2025, 14:32 · 554 días». */
export function lotDateDetail(iso: string, days: number): string {
  const d = new Date(iso)
  return `${LOT_DAY_LONG.format(d)}, ${LOT_TIME.format(d)} · ${plural(days, 'día', 'días')}`
}

/**
 * Origen legible de un lote. Al transferir entre wallets propias, el lote
 * destino hereda la fecha y el precio de compra del original, pero su
 * operación de origen es la transferencia: se muestra como traspaso, no como
 * «Retirada».
 */
export function lotSourceLabel(source: string, labels: Readonly<Record<string, { label: string }>>): string {
  if (source === 'WITHDRAW' || source === 'TRANSFER_INTERNAL') return 'Traspaso desde otra wallet'
  return labels[source]?.label ?? source
}
