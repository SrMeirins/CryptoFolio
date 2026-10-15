import type { DailyPnlDay } from '../api/portfolio'
import { buildPnlSeries, periodFrom, type PnlPeriod } from './pnlChart'
import { dayMs } from './chartAxes'

// Serie común de las pestañas P&L y Valor del gráfico de evolución (#215):
// la misma consulta alimenta ambas, así que cambiar de pestaña es inmediato y
// conserva el periodo.

export interface EvolutionPoint {
  x: number        // instante (ms UTC): medianoche del día o instante intradía
  pct: number      // rentabilidad acumulada según la métrica del periodo
  pnl: number      // P&L acumulado en la moneda de la respuesta
  value: number    // valor de la cartera
  live: boolean
}

export interface IntradayPoint { at: string; value: number; pnl: number; pct: number; live: boolean }

export type EvolutionQuery = { intraday: true } | { intraday: false; from?: string; to?: string }

/** Qué pedir al servidor para un periodo. El rango se acota a hoy (el servidor rechaza fechas futuras). */
export function evolutionQuery(period: PnlPeriod, today: string, range: { from: string; to: string } | null): EvolutionQuery {
  if (period === '24H') return { intraday: true }
  if (period === 'Rango' && range?.from) {
    const clamp = (d: string) => (d > today ? today : d)
    return { intraday: false, from: clamp(range.from), to: clamp(range.to || range.from) }
  }
  return { intraday: false, from: periodFrom(period, today) }
}

export function fromDaily(days: readonly DailyPnlDay[], period: PnlPeriod): EvolutionPoint[] {
  const series = buildPnlSeries(days, period)
  return series.map((p, i) => ({ x: dayMs(p.date), pct: p.pct, pnl: p.pnl, value: days[i].value, live: p.live }))
}

export function fromIntraday(points: readonly IntradayPoint[]): EvolutionPoint[] {
  return points.map(p => ({ x: Date.parse(p.at), pct: p.pct, pnl: p.pnl, value: p.value, live: p.live }))
}

const LONG_DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const DATE_TIME = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Madrid' })

/** Fecha del punto bajo el cursor: «15 de octubre de 2026» o, en 24H, «15 oct, 14:30» (hora de Madrid). */
export function formatPointDate(x: number, intraday: boolean): string {
  return (intraday ? DATE_TIME : LONG_DATE).format(new Date(x))
}
