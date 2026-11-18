import { describe, expect, it } from 'vitest'
import type { CalendarDay } from './pnlCalendar'
import { colorAlpha, gridMove, weekTotals } from './calendarStats'

// Calendario de P&L (#216).
const day = (date: string, pnl: number, pct: number | null = pnl, complete = true): CalendarDay => ({ date, pnl, pct, complete, live: false })

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

describe('gridMove', () => {
  it('flechas por días y semanas, Inicio y Fin de la semana; cruzan de mes (#512)', () => {
    expect(gridMove('2026-10-15', 'ArrowRight')).toBe('2026-10-16')
    expect(gridMove('2026-10-15', 'ArrowUp')).toBe('2026-10-08')
    expect(gridMove('2026-10-15', 'Home')).toBe('2026-10-12')   // jueves → lunes
    expect(gridMove('2026-10-15', 'End')).toBe('2026-10-18')
    expect(gridMove('2026-10-01', 'ArrowLeft')).toBe('2026-09-30')
    expect(gridMove('2026-10-29', 'ArrowDown')).toBe('2026-11-05')
    expect(gridMove('2026-12-31', 'ArrowRight')).toBe('2027-01-01')
    expect(gridMove('2026-10-15', 'Enter')).toBeNull()
  })
})
