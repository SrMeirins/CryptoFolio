// Serie del gráfico de rentabilidad acumulada del Dashboard (#166).
//
// Métrica por periodo:
// - 7D…1A: rentabilidad ponderada en el tiempo (TWR), la de los exchanges:
//   mide cómo rinde cada euro sin que los depósitos distorsionen el %.
// - Todo:  P&L acumulado sobre el máximo capital neto aportado (sin margen).
//   Con un historial largo y aportaciones tardías es la cifra más intuitiva:
//   el TWR se hunde para siempre tras una pérdida total puntual, y dividir por
//   el capital que queda dispara el % tras una retirada grande.

export type PnlPeriod = '7D' | '30D' | '90D' | '180D' | '1A' | 'Todo'

export const PNL_PERIODS: readonly PnlPeriod[] = ['7D', '30D', '90D', '180D', '1A', 'Todo']

const PERIOD_DAYS: Record<Exclude<PnlPeriod, 'Todo'>, number> = { '7D': 7, '30D': 30, '90D': 90, '180D': 180, '1A': 365 }

export interface PnlDay {
  date: string
  pnl: number
  cumulativePct: number
  cumulativePeakCapitalPct: number
  complete: boolean
  live: boolean
}

export interface PnlPoint {
  date: string
  pct: number
  pnl: number   // P&L acumulado en EUR hasta ese día
  live: boolean
}

export type PnlMetric = 'twr' | 'peakCapital'

export const METRIC_LABELS: Record<PnlMetric, { short: string; help: string }> = {
  twr: {
    short: 'Rentabilidad ponderada en el tiempo',
    help: 'Encadena la rentabilidad de cada día: mide cómo ha rendido la cartera sin que los depósitos ni las retiradas alteren el porcentaje.',
  },
  peakCapital: {
    short: 'Sobre capital aportado',
    help: 'Ganancia o pérdida acumulada dividida entre el máximo capital que has llegado a tener aportado (depósitos menos retiradas, sin contar el margen).',
  },
}

/** Día local de hoy en Madrid (YYYY-MM-DD). */
export function madridToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Primer día del periodo (incluido), o undefined para 'Todo'. */
export function periodFrom(period: PnlPeriod, today: string): string | undefined {
  if (period === 'Todo') return undefined
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - (PERIOD_DAYS[period] - 1))).toISOString().slice(0, 10)
}

export function metricFor(period: PnlPeriod): PnlMetric {
  return period === 'Todo' ? 'peakCapital' : 'twr'
}

/** Puntos del gráfico con la métrica del periodo y el P&L acumulado en EUR. */
export function buildPnlSeries(days: readonly PnlDay[], period: PnlPeriod): PnlPoint[] {
  const metric = metricFor(period)
  let cumulative = 0
  return days.map(day => {
    cumulative += day.pnl
    return {
      date: day.date,
      pct: metric === 'twr' ? day.cumulativePct : day.cumulativePeakCapitalPct,
      pnl: Math.round(cumulative * 100) / 100,
      live: day.live,
    }
  })
}
