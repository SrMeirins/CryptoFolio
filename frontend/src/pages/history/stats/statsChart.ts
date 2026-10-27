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
