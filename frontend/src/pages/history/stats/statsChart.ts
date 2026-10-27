import { STATS_CATEGORIES, type HistoryStats, type StatsCategory } from '../../../api/portfolio'
import type { Currency } from '../../../utils/format'
import { fmtMonthLabel } from '../helpers'

// Datos del gráfico de actividad del Historial (#376). Funciones puras: el
// cambio Número ↔ Valor y EUR ↔ USD se resuelve aquí, sin pedir nada.

export type ChartMode = 'ops' | 'valor'

export const CATEGORY_LABELS: Record<StatsCategory, string> = {
  compras: 'Compras', ventas: 'Ventas', otras_salidas: 'Otras salidas',
  ingresos: 'Ingresos', transferencias: 'Transferencias', otros: 'Otros',
}

export interface ChartRow extends Record<StatsCategory, number> { periodo: string; label: string; total: number }

/** Etiqueta de un periodo: «mar 25» por meses, «2025» por años. */
export function periodLabel(periodo: string, granularity: 'month' | 'year'): string {
  return granularity === 'year' ? periodo : fmtMonthLabel(periodo)
}

/** Filas del gráfico (y de su tabla accesible) en el modo y la moneda pedidos. */
export function chartRows(chart: HistoryStats['chart'], mode: ChartMode, currency: Currency): ChartRow[] {
  return chart.buckets.map(b => {
    const source = mode === 'ops' ? b.ops : b.valor[currency]
    const row = { periodo: b.periodo, label: periodLabel(b.periodo, chart.granularity), total: 0 } as ChartRow
    for (const c of STATS_CATEGORIES) {
      row[c] = source[c]
      row.total += source[c]
    }
    return row
  })
}

/** Texto del periodo del gráfico: «últimos 18 meses» o el rango filtrado. */
export function chartPeriodText(chart: HistoryStats['chart'], datesFiltered: boolean): string {
  if (!datesFiltered) return 'últimos 18 meses'
  const from = periodLabel(chart.from.slice(0, chart.granularity === 'year' ? 4 : 7), chart.granularity)
  const to = periodLabel(chart.to.slice(0, chart.granularity === 'year' ? 4 : 7), chart.granularity)
  const unit = chart.granularity === 'year' ? 'por años' : 'por meses'
  return from === to ? `${from} · ${unit}` : `${from} – ${to} · ${unit}`
}

// La tarjeta (#407) filtra la lista, no el resumen: las demás tarjetas siguen con sus cifras.
const NOT_STATS = new Set(['limit', 'offset', 'sort', 'dir', 'tarjeta', 'incluir_margen'])
/** Parámetros de la consulta: los de la lista sin paginación ni orden (no cambian las cifras). */
export function statsParams(listParams: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(listParams).filter(([k]) => !NOT_STATS.has(k)))
}

/** Rango de fechas (AAAA-MM-DD) de un periodo del gráfico (#413): el mes o el año completo. */
export function periodRange(periodo: string, granularity: 'month' | 'year'): { from: string; to: string } {
  if (granularity === 'year') return { from: `${periodo}-01-01`, to: `${periodo}-12-31` }
  const [y, m] = periodo.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${periodo}-01`, to: `${periodo}-${String(last).padStart(2, '0')}` }
}

/** Periodo del gráfico que coincide exactamente con el filtro de fechas; null si ninguno. */
export function activePeriod(chart: HistoryStats['chart'], from: string, to: string): string | null {
  if (!from || !to) return null
  return chart.buckets.find(b => {
    const r = periodRange(b.periodo, chart.granularity)
    return r.from === from && r.to === to
  })?.periodo ?? null
}

export interface BreakdownItem { category: StatsCategory; ops: number; value: number; share: number }

/**
 * Desglose de un periodo para el detalle al pasar el ratón (#413): número y
 * valor por categoría y su peso en la medida activa, de mayor a menor, sin
 * las vacías. La primera es la dominante.
 */
export function periodBreakdown(bucket: HistoryStats['chart']['buckets'][number], mode: ChartMode, currency: Currency) {
  const value = bucket.valor[currency]
  const measure = (c: StatsCategory) => (mode === 'ops' ? bucket.ops[c] : value[c])
  const total = STATS_CATEGORIES.reduce((s, c) => s + measure(c), 0)
  const items: BreakdownItem[] = STATS_CATEGORIES
    .filter(c => bucket.ops[c] > 0 || value[c] > 0)
    .map(c => ({ category: c, ops: bucket.ops[c], value: value[c], share: total > 0 ? measure(c) / total : 0 }))
    .sort((a, b) => b.share - a.share || b.ops - a.ops)
  return {
    items,
    ops: STATS_CATEGORIES.reduce((s, c) => s + bucket.ops[c], 0),
    value: STATS_CATEGORIES.reduce((s, c) => s + value[c], 0),
  }
}
