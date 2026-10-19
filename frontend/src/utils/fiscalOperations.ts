import type { FiscalEvent } from '../pages/fiscal/types'
import { fiscalTypeLabel, type FiscalTone } from './fiscalTable'
import { sanitizeCsvField } from './csvSafety'

// Operaciones de Fiscal (#299): filtros, orden, recuentos por tipo, resumen de
// recompras y CSV de lo filtrado. Funciones puras.

/** Umbral por debajo del cual un G/P se considera 0 (céntimos de redondeo). */
const PNL_EPS = 0.005

export type ResultFilter = 'all' | 'gain' | 'loss'
export type SortKey = 'fecha' | 'activoTransmitido' | 'gananciaPerdidaEur' | 'valorTransmisionEur'
export type SortDir = 'asc' | 'desc'

export interface EventFilters {
  asset: string
  result: ResultFilter
  from: string
  to: string
  /** Tipos seleccionados; vacío = todos. */
  tones: readonly FiscalTone[]
  onlyWarnings: boolean
  /** Solo pérdidas posiblemente diferidas (botón «Ver solo estas»). */
  onlyRecompra: boolean
  search: string
}

export const EMPTY_FILTERS: EventFilters = { asset: '', result: 'all', from: '', to: '', tones: [], onlyWarnings: false, onlyRecompra: false, search: '' }

export function hasWarning(e: FiscalEvent): boolean {
  return !!(e.posiblePerdidaDiferida || e.permutaWrapStaking || e.lostSinMotivo)
}

export function isFiltered(f: EventFilters): boolean {
  return f.asset !== '' || f.result !== 'all' || f.from !== '' || f.to !== '' || f.tones.length > 0 || f.onlyWarnings || f.onlyRecompra || f.search.trim() !== ''
}

export function filterEvents(events: readonly FiscalEvent[], f: EventFilters): FiscalEvent[] {
  const q = f.search.trim().toLowerCase()
  return events.filter(e => {
    if (f.asset && e.activoTransmitido !== f.asset && e.activoRecibido !== f.asset) return false
    const gp = e.gananciaPerdidaEur ?? 0
    if (f.result === 'gain' && gp <= PNL_EPS) return false
    if (f.result === 'loss' && gp >= -PNL_EPS) return false
    if (f.from && e.fecha < f.from) return false
    if (f.to && e.fecha > f.to) return false
    if (f.tones.length > 0 && !f.tones.includes(fiscalTypeLabel(e.tipo).tone)) return false
    if (f.onlyWarnings && !hasWarning(e)) return false
    if (f.onlyRecompra && !e.posiblePerdidaDiferida) return false
    if (q) {
      const haystack = [e.activoTransmitido, e.activoRecibido ?? '', e.wallet, e.contrapartidaClave, e.contrapartidaDescripcion].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

export function sortEvents(events: readonly FiscalEvent[], key: SortKey, dir: SortDir): FiscalEvent[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...events].sort((a, b) => {
    // La fecha se ordena por el instante exacto cuando existe; si empatan, por eventId (orden estable).
    if (key === 'fecha') {
      const ta = a.fechaHora ?? a.fecha, tb = b.fechaHora ?? b.fecha
      return sign * (ta.localeCompare(tb) || a.eventId.localeCompare(b.eventId))
    }
    const va = a[key] ?? 0, vb = b[key] ?? 0
    if (typeof va === 'string' && typeof vb === 'string') return sign * va.localeCompare(vb)
    return sign * ((va as number) - (vb as number))
  })
}

/** Recuento por tipo, en el orden de los chips. */
export function toneCounts(events: readonly FiscalEvent[]): { tone: FiscalTone; label: string; count: number }[] {
  const map = new Map<FiscalTone, { label: string; count: number }>()
  for (const e of events) {
    const t = fiscalTypeLabel(e.tipo)
    const cur = map.get(t.tone) ?? { label: t.tone === 'loss' ? 'Pérdida' : t.label, count: 0 }
    cur.count++
    map.set(t.tone, cur)
  }
  const order: FiscalTone[] = ['sale', 'swap', 'fee', 'loss', 'margin', 'other']
  return order.filter(t => map.has(t)).map(t => ({ tone: t, ...map.get(t)! }))
}

export interface RecompraSummary { count: number; amount: number; topAssets: { asset: string; count: number }[] }

/** Pérdidas posiblemente diferidas del año completo (art. 33.5 LIRPF). */
export function recompraSummary(events: readonly FiscalEvent[]): RecompraSummary {
  let count = 0, amount = 0
  const byAsset = new Map<string, number>()
  for (const e of events) {
    if (!e.posiblePerdidaDiferida) continue
    count++
    amount += Math.min(0, e.gananciaPerdidaEur ?? 0)
    byAsset.set(e.activoTransmitido, (byAsset.get(e.activoTransmitido) ?? 0) + 1)
  }
  const topAssets = [...byAsset].map(([asset, n]) => ({ asset, count: n })).sort((a, b) => b.count - a.count || a.asset.localeCompare(b.asset)).slice(0, 3)
  return { count, amount, topAssets }
}

const num = (n: number | null | undefined, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '' : n.toFixed(d))

/** CSV de las operaciones filtradas (separador «;», campos de texto saneados). */
export function buildEventsCsv(events: readonly FiscalEvent[]): string {
  const header = ['Fecha', 'Tipo', 'Activo transmitido', 'Activo recibido', 'Wallet', 'Cantidad', 'Clave AEAT', 'Contrapartida',
    'Valor transmisión (EUR)', 'Gastos venta (EUR)', 'Valor adquisición (EUR)', 'Gastos compra (EUR)', 'G/P (EUR)', 'Avisos'].join(';')
  const lines = events.map(e => {
    const avisos = [e.posiblePerdidaDiferida && 'recompra', e.permutaWrapStaking && 'wrap staking', e.lostSinMotivo && 'pérdida sin motivo'].filter(Boolean).join(', ')
    return [
      e.fecha, fiscalTypeLabel(e.tipo).label, sanitizeCsvField(e.activoTransmitido), sanitizeCsvField(e.activoRecibido ?? ''),
      sanitizeCsvField(e.wallet), num(e.cantidadTransmitida, 12).replace(/\.?0+$/, ''), sanitizeCsvField(e.contrapartidaClave),
      sanitizeCsvField(e.contrapartidaDescripcion), num(e.valorTransmisionEur), num(e.gastosTransmisionEur),
      num(e.valorAdquisicionEur), num(e.gastosAdquisicionEur), num(e.gananciaPerdidaEur), avisos,
    ].join(';')
  })
  return [header, ...lines].join('\n')
}
