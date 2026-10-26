import { describe, expect, it } from 'vitest'
import { buildPnlSeries, localToday, metricFor, periodFrom, type PnlDay } from './pnlChart'

const day = (date: string, pnl: number, twr: number, cap: number, live = false): PnlDay =>
  ({ date, pnl, cumulativePct: twr, cumulativePeakCapitalPct: cap, complete: true, live })

describe('localToday', () => {
  it('usa la fecha de Madrid, no la UTC', () => {
    // 23:30 UTC del 8 de octubre = 01:30 del 9 en Madrid (CEST)
    expect(localToday(new Date('2026-10-08T23:30:00Z'))).toBe('2026-10-09')
    // 23:30 UTC del 8 de enero = 00:30 del 9 en Madrid (CET)
    expect(localToday(new Date('2026-01-08T23:30:00Z'))).toBe('2026-01-09')
  })
})

describe('periodFrom', () => {
  it('incluye el día de hoy en el número de días del periodo', () => {
    expect(periodFrom('7D', '2026-10-08')).toBe('2026-10-02')
    expect(periodFrom('30D', '2026-10-08')).toBe('2026-09-09')
    expect(periodFrom('1A', '2026-10-08')).toBe('2025-10-09')
  })

  it('cruza correctamente fin de mes y de año', () => {
    expect(periodFrom('7D', '2026-01-03')).toBe('2025-12-28')
  })

  it("'Todo' no tiene fecha de inicio", () => {
    expect(periodFrom('Todo', '2026-10-08')).toBeUndefined()
  })
})

describe('buildPnlSeries', () => {
  const days = [day('2026-10-06', 100, 1, 0.8), day('2026-10-07', -40, 0.5, 0.48), day('2026-10-08', 10, 0.6, 0.56, true)]

  it('todos los periodos usan el % sobre el capital aportado, no el TWR (#353)', () => {
    for (const period of ['24H', '7D', '30D', 'YTD', 'Rango', 'Todo'] as const) expect(metricFor(period)).toBe('peakCapital')
    expect(buildPnlSeries(days, '7D').map(p => p.pct)).toEqual([0.8, 0.48, 0.56])
  })

  it("'Todo' usa el % sobre el máximo capital aportado", () => {
    expect(metricFor('Todo')).toBe('peakCapital')
    expect(buildPnlSeries(days, 'Todo').map(p => p.pct)).toEqual([0.8, 0.48, 0.56])
  })

  it('acumula el P&L en EUR y conserva la marca de día en vivo', () => {
    const series = buildPnlSeries(days, '7D')
    expect(series.map(p => p.pnl)).toEqual([100, 60, 70])
    expect(series[2].live).toBe(true)
  })
})
