import type { LotView } from './portfolioLots'
import { zonedFormat } from './zonedFormat'

// Lotes abiertos agrupados por mes de compra (#528) para el panel de detalle:
// cada grupo resume cantidad, coste, valor y resultado, y se despliega en una
// tabla con sus lotes. El orden es el del FIFO global (el más antiguo primero).

export interface LotMonthGroup {
  /** AAAA-MM en la zona horaria de la aplicación. */
  key: string
  label: string
  lots: LotView[]
  quantity: number
  cost: number
  value: number
  /** null si algún lote no tiene precio actual. */
  pnl: number | null
  pnlPct: number | null
  /** El grupo contiene el próximo lote que se vendería. */
  next: boolean
}

const MONTH_KEY = () => zonedFormat('en-CA', { year: 'numeric', month: '2-digit' })
const MONTH_LABEL = () => zonedFormat('es-ES', { month: 'long', year: 'numeric' })

/** Clave AAAA-MM de una fecha ISO en la zona horaria de la aplicación. */
export function monthKey(iso: string): string {
  return MONTH_KEY().format(new Date(iso)).slice(0, 7)
}

/** «Marzo de 2024». */
export function monthLabel(iso: string): string {
  const s = MONTH_LABEL().format(new Date(iso))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function lotsByMonth(lots: readonly LotView[]): LotMonthGroup[] {
  const groups = new Map<string, LotMonthGroup>()
  for (const l of lots) {
    const key = monthKey(l.openedAt)
    let g = groups.get(key)
    if (!g) {
      g = { key, label: monthLabel(l.openedAt), lots: [], quantity: 0, cost: 0, value: 0, pnl: 0, pnlPct: null, next: false }
      groups.set(key, g)
    }
    g.lots.push(l)
    g.quantity += l.quantity
    g.cost += l.cost
    g.value += l.value
    g.pnl = g.pnl === null || l.pnl === null ? null : g.pnl + l.pnl
    g.next ||= l.next
  }
  return [...groups.values()].map(g => ({ ...g, pnlPct: g.pnl !== null && g.cost > 0 ? (g.pnl / g.cost) * 100 : null }))
}
