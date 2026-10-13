// Calendario mensual de P&L diario del Dashboard (#167). Funciones puras:
// cuadrícula del mes (lunes a domingo), rango a consultar, resumen del mes e
// intensidad del color de cada día.

export interface YearMonth {
  year: number
  month: number // 1-12
}

export interface CalendarDay {
  date: string
  pnl: number
  pct: number | null
  complete: boolean
  live: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

export function ymOf(date: string): YearMonth {
  const [year, month] = date.split('-').map(Number)
  return { year, month }
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

export function compareYm(a: YearMonth, b: YearMonth): number {
  return a.year !== b.year ? a.year - b.year : a.month - b.month
}

function daysInMonth({ year, month }: YearMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Semanas del mes de lunes a domingo; null en los huecos de inicio y fin. */
export function monthGrid(ym: YearMonth): (string | null)[][] {
  const first = new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay() // 0 = domingo
  const offset = (first + 6) % 7                                          // 0 = lunes
  const cells: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth(ym) }, (_, i) => `${ym.year}-${pad(ym.month)}-${pad(i + 1)}`),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Rango de días a pedir para un mes: del día 1 al último, sin pasar de hoy. null si el mes es futuro. */
export function monthRange(ym: YearMonth, today: string): { from: string; to: string } | null {
  const from = `${ym.year}-${pad(ym.month)}-01`
  if (from > today) return null
  const last = `${ym.year}-${pad(ym.month)}-${pad(daysInMonth(ym))}`
  return { from, to: last < today ? last : today }
}

/** Total del mes en EUR y rentabilidad encadenada (TWR) de sus días. */
export function monthSummary(days: readonly CalendarDay[]): { pnl: number; pct: number } {
  let pnl = 0
  let growth = 1
  for (const d of days) {
    pnl += d.pnl
    if (d.pct !== null) growth *= 1 + d.pct / 100
  }
  return { pnl: Math.round(pnl * 100) / 100, pct: (growth - 1) * 100 }
}

/**
 * Intensidad del color de un día (1-4) según su |P&L| respecto al mayor |P&L|
 * del mes; 0 si el P&L es 0.
 */
export function intensity(pnl: number, maxAbs: number): 0 | 1 | 2 | 3 | 4 {
  if (pnl === 0 || maxAbs <= 0) return 0
  const ratio = Math.abs(pnl) / maxAbs
  return ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1
}

export const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

export function monthLabel({ year, month }: YearMonth): string {
  const label = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
