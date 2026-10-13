import { describe, expect, it } from 'vitest'
import { addMonths, compareYm, intensity, monthGrid, monthLabel, monthRange, monthSummary, ymOf, type CalendarDay } from './pnlCalendar'

const day = (date: string, pnl: number, pct: number | null): CalendarDay => ({ date, pnl, pct, complete: true, live: false })

describe('monthGrid', () => {
  it('empieza en lunes y rellena los huecos (octubre de 2026 empieza en jueves)', () => {
    const weeks = monthGrid({ year: 2026, month: 10 })
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weeks.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null])
    expect(weeks.every(w => w.length === 7)).toBe(true)
  })

  it('febrero bisiesto tiene 29 días', () => {
    const cells = monthGrid({ year: 2028, month: 2 }).flat().filter(Boolean)
    expect(cells).toHaveLength(29)
    expect(cells.at(-1)).toBe('2028-02-29')
  })
})

describe('monthRange', () => {
  it('mes pasado: del día 1 al último', () => {
    expect(monthRange({ year: 2026, month: 9 }, '2026-10-13')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('mes en curso: hasta hoy', () => {
    expect(monthRange({ year: 2026, month: 10 }, '2026-10-13')).toEqual({ from: '2026-10-01', to: '2026-10-13' })
  })

  it('mes futuro: null', () => {
    expect(monthRange({ year: 2026, month: 11 }, '2026-10-13')).toBeNull()
  })
})

describe('navegación entre meses', () => {
  it('cruza el cambio de año en ambos sentidos', () => {
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(addMonths({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 })
  })

  it('compara y extrae año-mes', () => {
    expect(ymOf('2026-10-13')).toEqual({ year: 2026, month: 10 })
    expect(compareYm({ year: 2025, month: 12 }, { year: 2026, month: 1 })).toBeLessThan(0)
  })

  it('etiqueta en español con mayúscula inicial', () => {
    expect(monthLabel({ year: 2026, month: 10 })).toBe('Octubre de 2026')
  })
})

describe('monthSummary', () => {
  it('suma el P&L y encadena los % diarios; los días sin % no alteran la rentabilidad', () => {
    const s = monthSummary([day('2026-10-01', 100, 10), day('2026-10-02', -55, -5), day('2026-10-03', 0, null)])
    expect(s.pnl).toBe(45)
    expect(s.pct).toBeCloseTo((1.1 * 0.95 - 1) * 100, 10)
  })
})

describe('intensity', () => {
  it('escala de 1 a 4 según la magnitud relativa al mayor del mes', () => {
    expect(intensity(0, 100)).toBe(0)
    expect(intensity(10, 100)).toBe(1)
    expect(intensity(-40, 100)).toBe(2)
    expect(intensity(60, 100)).toBe(3)
    expect(intensity(-100, 100)).toBe(4)
  })
})
