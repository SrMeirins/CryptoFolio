import { formatMoney, formatPercent, type Currency } from './format'
import { formatTick } from './chartAxes'
import type { PeriodSummary } from './evolutionSummary'

// Mini-tarjetas del resumen del gráfico de evolución (#250): mejor día, peor
// día (u hora en 24H) y máxima caída, cada una con etiqueta visible, valor,
// detalle y explicación. Siempre las tres, con «—» si no hay dato, para que el
// bloque no cambie de forma al cambiar de periodo.

export type TileId = 'best' | 'worst' | 'drawdown'
export type TileTone = 'positive' | 'negative' | 'neutral'

export interface SummaryTile {
  id: TileId
  label: string
  help: string
  value: string           // «+120,50 €», «−18,40 %» o «—»
  badge: string | null    // % del día, o null
  detail: string          // fecha, franja horaria o rango; vacío sin dato
  tone: TileTone
  /** Día (YYYY-MM-DD) cuyo detalle se puede abrir; null en 24H o sin dato. */
  day: string | null
}

const HOUR = 3_600_000
const DAY = 86_400_000
const SHORT_DAY = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })
const signedMoney = (n: number, currency: Currency) => `${n >= 0 ? '+' : ''}${formatMoney(n, currency)}`
const shortDay = (x: number) => SHORT_DAY.format(new Date(x)).replace('.', '')
const isoDay = (x: number) => new Date(x).toISOString().slice(0, 10)

/** Fecha corta («12 oct 26») o, en 24H, la franja horaria («14:00–15:00»). */
function when(x: number, intraday: boolean): string {
  return intraday ? `${formatTick(x, 'hour3')}–${formatTick(x + HOUR, 'hour3')}` : shortDay(x)
}

export function summaryTiles(summary: PeriodSummary | null, intraday: boolean, currency: Currency): SummaryTile[] {
  const unit = intraday ? 'hora' : 'día'
  const extreme = (id: 'best' | 'worst'): SummaryTile => {
    const e = summary?.[id] ?? null
    const best = id === 'best'
    const base = {
      id,
      label: `${best ? 'Mejor' : 'Peor'} ${unit}`,
      help: `${best ? 'Mayor ganancia' : 'Mayor pérdida'} de un ${unit} del periodo, en importe. El % es sobre el capital al empezar ese ${unit}; no se muestra si era muy pequeño.`,
    }
    if (!e) return { ...base, value: '—', badge: null, detail: best ? 'Sin días en positivo' : 'Sin días en negativo', tone: 'neutral', day: null }
    return {
      ...base,
      value: signedMoney(e.pnl, currency),
      badge: e.pct === null ? null : formatPercent(e.pct, 2, true),
      detail: when(e.x, intraday),
      tone: best ? 'positive' : 'negative',
      day: intraday ? null : isoDay(e.x),
    }
  }
  const dd = summary?.drawdown ?? null
  const span = dd && !intraday ? Math.round((dd.toX - dd.fromX) / DAY) : null
  const drawdown: SummaryTile = {
    id: 'drawdown',
    label: 'Máx. caída',
    help: 'Mayor bajada de la rentabilidad desde un máximo del periodo hasta el mínimo posterior, sin contar depósitos ni retiradas.',
    value: dd ? formatPercent(dd.pct, 2) : '—',
    badge: span === null ? null : `${span} ${span === 1 ? 'día' : 'días'}`,
    detail: dd ? `${intraday ? formatTick(dd.fromX, 'hour3') : shortDay(dd.fromX)} → ${intraday ? formatTick(dd.toX, 'hour3') : shortDay(dd.toX)}` : 'Sin caídas en el periodo',
    tone: dd ? 'negative' : 'neutral',
    day: null,
  }
  return [extreme('best'), extreme('worst'), drawdown]
}
