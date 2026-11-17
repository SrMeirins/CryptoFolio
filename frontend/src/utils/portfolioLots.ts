import type { OpenLot } from '../api/portfolio'
import type { Currency } from './format'
import { zonedFormat } from './zonedFormat'

// Lotes FIFO de un activo para el panel de detalle de Portfolio (#272).
// Funciones puras: importes en la moneda de visualización, P&L por lote,
// antigüedad y el próximo lote que se vendería: el más antiguo del activo en
// cualquier wallet (FIFO global, #476; el backend los da en ese orden).

export interface LotView {
  lotId: string
  /** Ids de los lotes que agrupa: más de uno si son trozos de la misma compra (#528). */
  lotIds: string[]
  /** Número de trozos unidos; 1 si es un lote tal cual. */
  trozos: number
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
  next: boolean             // el primero que se vendería (FIFO global)
  source: string
  /** Wallet de la que llegó el lote si es un traspaso o una reubicación (#528). */
  sourceWalletName: string | null
  sourceWalletColor: string | null
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
  return lots.map((l, i) => {
    const quantity = parseFloat(l.quantity_remaining)
    const quantityOriginal = parseFloat(l.quantity_original)
    const cost = toDisplay(parseFloat(l.cost_basis_eur), l.usd_per_eur, currency, liveRate)
    const value = quantity * price
    const pnl = price > 0 ? value - cost : null
    const next = i === 0
    return {
      lotId: l.lot_id,
      lotIds: [l.lot_id],
      trozos: 1,
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
      sourceWalletName: l.source_wallet_name ?? null,
      sourceWalletColor: l.source_wallet_color ?? null,
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

const LOT_DATE = () => zonedFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const LOT_DAY_LONG = () => zonedFormat('es-ES', { dateStyle: 'long' })
const LOT_TIME = () => zonedFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

/** Fecha de apertura con el año completo: «9 abr 2025». */
export function formatLotDate(iso: string): string {
  return LOT_DATE().format(new Date(iso)).replace('.', '')
}

/** Detalle del tooltip: «9 de abril de 2025, 14:32 · 554 días». */
export function lotDateDetail(iso: string, days: number): string {
  const d = new Date(iso)
  return `${LOT_DAY_LONG().format(d)}, ${LOT_TIME().format(d)} · ${plural(days, 'día', 'días')}`
}

/**
 * Origen legible de un lote. Al transferir entre wallets propias, el lote
 * destino hereda la fecha y el precio de compra del original, pero su
 * operación de origen es la transferencia: se muestra como traspaso, no como
 * «Retirada».
 */
export function lotSourceLabel(source: string, labels: Readonly<Record<string, { label: string }>>, fromWallet: string | null = null): string {
  const prefix = lotOriginPrefix(source)
  if (prefix && fromWallet) return `${prefix} ${fromWallet}`
  if (source === 'WITHDRAW' || source === 'TRANSFER_INTERNAL') return 'Traspaso desde otra wallet'
  if (source === 'REUBICACION') return 'Reubicado por el FIFO global'
  return labels[source]?.label ?? source
}

/** Inicio del texto de origen de un lote llegado de otra wallet (#528): «Traspaso desde», «Reubicado desde». */
export function lotOriginPrefix(source: string): string | null {
  if (source === 'WITHDRAW' || source === 'TRANSFER_INTERNAL') return 'Traspaso desde'
  if (source === 'REUBICACION') return 'Reubicado desde'
  return null
}

/**
 * Une los trozos de una misma compra (#528): lotes de la misma wallet, con la
 * misma fecha de apertura y el mismo precio de compra. Aparecen, por ejemplo,
 * al retirar a otra wallet pagando la comisión de red en el propio activo: el
 * FIFO global cobra la comisión del lote más antiguo y, para que cada wallet
 * conserve su saldo, reubica esa cantidad desde la compra del día; la compra
 * llega al destino en dos lotes. Es correcto para el cálculo; en la vista se
 * muestran como uno. Conserva el orden FIFO (el del primer trozo).
 */
export function unirTrozos(lots: readonly LotView[]): LotView[] {
  const out: LotView[] = []
  const byKey = new Map<string, LotView>()
  for (const l of lots) {
    const key = `${l.walletId}|${l.openedAt}|${l.unitCost.toPrecision(10)}`
    const g = byKey.get(key)
    if (!g) {
      const copia = { ...l, lotIds: [...l.lotIds] }
      byKey.set(key, copia)
      out.push(copia)
      continue
    }
    g.lotIds.push(...l.lotIds)
    g.trozos += l.trozos
    g.quantity += l.quantity
    g.quantityOriginal += l.quantityOriginal
    g.cost += l.cost
    g.value += l.value
    g.pnl = g.pnl === null || l.pnl === null ? null : g.pnl + l.pnl
    g.pnlPct = g.pnl !== null && g.cost > 0 ? (g.pnl / g.cost) * 100 : null
    g.partial = g.quantity < g.quantityOriginal - 1e-9
    g.next ||= l.next
    // El origen con wallet (traspaso) es más informativo que una reubicación sin ella.
    if (!g.sourceWalletName && l.sourceWalletName) {
      g.sourceWalletName = l.sourceWalletName
      g.sourceWalletColor = l.sourceWalletColor
      g.source = l.source
    }
  }
  return out
}
