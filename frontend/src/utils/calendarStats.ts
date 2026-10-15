import { monthSummary, type CalendarDay, type YearMonth } from './pnlCalendar'

// Calendario de P&L (#216): estadísticas del mes, totales por semana, escala de
// color continua, resumen anual y navegación con teclado. Funciones puras.

export interface MonthStats {
  positive: number
  negative: number
  best: CalendarDay | null
  worst: CalendarDay | null
  average: number              // P&L medio por día con dato
  streak: { sign: 'up' | 'down'; days: number } | null  // racha que termina en el último día con dato
}

/** Estadísticas de los días completos del mes (en orden cronológico). */
export function monthStats(days: readonly CalendarDay[]): MonthStats {
  const done = days.filter(d => d.complete)
  const best = done.reduce<CalendarDay | null>((b, d) => (d.pnl > 0 && (!b || d.pnl > b.pnl) ? d : b), null)
  const worst = done.reduce<CalendarDay | null>((w, d) => (d.pnl < 0 && (!w || d.pnl < w.pnl) ? d : w), null)
  let streakSign: 'up' | 'down' | null = null
  let streakDays = 0
  for (let i = done.length - 1; i >= 0; i--) {
    const sign = done[i].pnl > 0 ? 'up' : done[i].pnl < 0 ? 'down' : null
    if (!sign || (streakSign && streakSign !== sign)) break
    streakSign = sign
    streakDays++
  }
  const streak = streakSign ? { sign: streakSign, days: streakDays } : null
  const total = done.reduce((s, d) => s + d.pnl, 0)
  return {
    positive: done.filter(d => d.pnl > 0).length,
    negative: done.filter(d => d.pnl < 0).length,
    best, worst,
    average: done.length ? Math.round((total / done.length) * 100) / 100 : 0,
    streak,
  }
}

/** P&L de cada semana de la cuadrícula (días completos); null si la semana no tiene datos. */
export function weekTotals(weeks: ReadonlyArray<ReadonlyArray<string | null>>, byDate: ReadonlyMap<string, CalendarDay>): Array<number | null> {
  return weeks.map(week => {
    const days = week.map(d => (d ? byDate.get(d) : undefined)).filter((d): d is CalendarDay => !!d && d.complete)
    return days.length ? Math.round(days.reduce((s, d) => s + d.pnl, 0) * 100) / 100 : null
  })
}

/**
 * Opacidad del color de un día (en %), continua según su |P&L| respecto al
 * mayor del periodo. Raíz cuadrada para que los días pequeños sigan viéndose;
 * 0 si el P&L es 0. Rango 8–40 %, legible sobre ambos temas.
 */
export function colorAlpha(pnl: number, maxAbs: number): number {
  if (pnl === 0 || maxAbs <= 0) return 0
  return Math.round(8 + 32 * Math.sqrt(Math.min(1, Math.abs(pnl) / maxAbs)))
}

export interface MonthTotal { ym: YearMonth; pnl: number; pct: number; days: number }

/** Totales de los 12 meses de un año a partir de sus días; null en los meses sin datos. */
export function yearMonths(days: readonly CalendarDay[], year: number): Array<MonthTotal | null> {
  return Array.from({ length: 12 }, (_, i) => {
    const prefix = `${year}-${String(i + 1).padStart(2, '0')}-`
    const month = days.filter(d => d.complete && d.date.startsWith(prefix))
    if (month.length === 0) return null
    const { pnl, pct } = monthSummary(month)
    return { ym: { year, month: i + 1 }, pnl, pct, days: month.length }
  })
}

/**
 * Día al que mueve una tecla en la cuadrícula (patrón grid del WAI-ARIA):
 * flechas ±1 día o ±1 semana, Inicio/Fin al lunes/domingo de la semana. null
 * si la tecla no aplica o el destino cae fuera del mes.
 */
export function gridMove(date: string, key: string): string | null {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7   // 0 = lunes
  const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday }
  if (!(key in delta)) return null
  const next = new Date(Date.UTC(y, m - 1, d + delta[key]))
  if (next.getUTCMonth() !== m - 1) return null
  return next.toISOString().slice(0, 10)
}
