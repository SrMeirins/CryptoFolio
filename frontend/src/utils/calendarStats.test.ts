import { describe, expect, it } from 'vitest'
import type { CalendarDay } from './pnlCalendar'
import { colorAlpha, gridMove, monthCumulative, monthStats, weekTotals, yearMonths } from './calendarStats'

// Calendario de P&L (#216).
const day = (date: string, pnl: number, pct: number | null = pnl, complete = true): CalendarDay => ({ date, pnl, pct, complete, live: false })

describe('monthStats', () => {
  const days = [day('2026-10-01', 10), day('2026-10-02', -4), day('2026-10-03', 0), day('2026-10-04', 3), day('2026-10-05', 5), day('2026-10-06', 99, 1, false)]
  it('días positivos y negativos, mejor, peor y media de los días completos', () => {
    const s = monthStats(days)
    expect(s.positive).toBe(3)
    expect(s.negative).toBe(1)
    expect(s.best?.date).toBe('2026-10-01')
    expect(s.worst?.date).toBe('2026-10-02')
    expect(s.average).toBe(2.8)                 // 14 / 5
  })
  it('racha actual: días seguidos del mismo signo hasta el último con dato; el 0 la corta', () => {
    expect(monthStats(days).streak).toEqual({ sign: 'up', days: 2 })
    expect(monthStats([day('2026-10-01', -1), day('2026-10-02', -2)]).streak).toEqual({ sign: 'down', days: 2 })
    expect(monthStats([day('2026-10-01', 5), day('2026-10-02', 0)]).streak).toBeNull()
  })
  it('sin días: todo a cero', () => {
    expect(monthStats([])).toEqual({ positive: 0, negative: 0, best: null, worst: null, average: 0, streak: null })
  })
})

describe('weekTotals', () => {
  it('suma los días completos de cada semana; null si no hay datos', () => {
    const byDate = new Map([day('2026-10-01', 10), day('2026-10-02', -4.555), day('2026-10-05', 7, 7, false)].map(d => [d.date, d]))
    const weeks = [[null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], ['2026-10-05', '2026-10-06', null, null, null, null, null]]
    expect(weekTotals(weeks, byDate)).toEqual([5.45, null])
  })
})

describe('colorAlpha', () => {
  it('continua, creciente y acotada entre 8 % y 40 %; 0 sin P&L', () => {
    expect(colorAlpha(0, 100)).toBe(0)
    expect(colorAlpha(100, 100)).toBe(40)
    expect(colorAlpha(-100, 100)).toBe(40)
    expect(colorAlpha(1, 100)).toBe(11)
    expect(colorAlpha(25, 100)).toBe(24)
    expect(colorAlpha(50, 0)).toBe(0)
    expect(colorAlpha(500, 100)).toBe(40)
  })
})

describe('yearMonths', () => {
  it('12 meses con total y rentabilidad encadenada; null en los meses sin datos', () => {
    const r = yearMonths([day('2026-01-05', 10, 10), day('2026-01-06', -5, -10), day('2026-03-01', 2, 1), day('2025-12-31', 50)], 2026)
    expect(r).toHaveLength(12)
    expect(r[0]).toMatchObject({ pnl: 5, days: 2 })
    expect(r[0]?.pct).toBeCloseTo(-1, 6)        // 1,10 × 0,90 − 1
    expect(r[1]).toBeNull()
    expect(r[2]).toMatchObject({ ym: { year: 2026, month: 3 }, pnl: 2 })
  })
})

describe('gridMove', () => {
  it('flechas por días y semanas, Inicio y Fin de la semana, sin salir del mes', () => {
    expect(gridMove('2026-10-15', 'ArrowRight')).toBe('2026-10-16')
    expect(gridMove('2026-10-15', 'ArrowUp')).toBe('2026-10-08')
    expect(gridMove('2026-10-15', 'Home')).toBe('2026-10-12')   // jueves → lunes
    expect(gridMove('2026-10-15', 'End')).toBe('2026-10-18')
    expect(gridMove('2026-10-01', 'ArrowLeft')).toBeNull()
    expect(gridMove('2026-10-29', 'ArrowDown')).toBeNull()
    expect(gridMove('2026-10-15', 'Enter')).toBeNull()
  })
})

describe('monthCumulative (#234)', () => {
  it('acumula el P&L de los días completos, con su número de día', () => {
    expect(monthCumulative([day('2026-10-01', 10), day('2026-10-02', -4.555), day('2026-10-03', 99, 1, false), day('2026-10-04', 1)])).toEqual([
      { date: '2026-10-01', day: 1, pnl: 10, cum: 10 },
      { date: '2026-10-02', day: 2, pnl: -4.555, cum: 5.45 },
      { date: '2026-10-04', day: 4, pnl: 1, cum: 6.45 },
    ])
    expect(monthCumulative([])).toEqual([])
  })
})
