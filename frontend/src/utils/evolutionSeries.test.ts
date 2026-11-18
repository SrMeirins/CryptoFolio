import { describe, expect, it } from 'vitest'
import type { DailyPnlDay } from '../api/portfolio'
import { formatPointDate, formatPointDateShort, fromDaily, fromIntraday } from './evolutionSeries'

// Series del gráfico de evolución (#215; los periodos, en rangoGrafico, #508).

describe('serie común de P&L y Valor', () => {
  const day = (date: string, value: number, pnl: number, pct: number, live = false): DailyPnlDay => ({
    date, value, pnl, pct, inflow: 0, outflow: 0, netCapitalFlow: 0, cumulativePct: pct, cumulativeDietzPct: pct,
    cumulativePeakCapitalPct: pct / 2, capitalIn: 0, capitalOut: 0, complete: true, live,
  })

  it('diaria: fecha a medianoche UTC, valor del día y % sobre capital aportado (#353)', () => {
    const days = [day('2026-10-14', 100, 0, 0), day('2026-10-15', 110, 10, 10, true)]
    expect(fromDaily(days, '7D')).toEqual([
      { x: Date.UTC(2026, 9, 14), pct: 0, pnl: 0, value: 100, stepPct: 0, deposit: 0, withdrawal: 0, live: false },
      { x: Date.UTC(2026, 9, 15), pct: 5, pnl: 10, value: 110, stepPct: 10, deposit: 0, withdrawal: 0, live: true },
    ])
    expect(fromDaily(days, 'Todo')[1].pct).toBe(5)   // mismo criterio que «Todo»
  })

  it('intradía: instante exacto de cada punto', () => {
    expect(fromIntraday([{ at: '2026-10-15T09:15:00.000Z', value: 5, pnl: 1, pct: 2, stepPct: 0.5, capitalIn: 3, capitalOut: 1, live: false }]))
      .toEqual([{ x: Date.UTC(2026, 9, 15, 9, 15), pct: 2, pnl: 1, value: 5, stepPct: 0.5, deposit: 3, withdrawal: 1, live: false }])
  })
})

describe('formatPointDate', () => {
  it('fecha larga en la serie diaria y día con hora de Madrid en 24H', () => {
    expect(formatPointDate(Date.UTC(2026, 9, 15), false)).toBe('15 de octubre de 2026')
    expect(formatPointDate(Date.UTC(2026, 9, 15, 12, 30), true)).toMatch(/^15 oct\.?, 14:30$/)
  })
})

describe('formatPointDateShort (#509)', () => {
  it('día corto en UTC y, en 24 h, día y hora', () => {
    expect(formatPointDateShort(Date.UTC(2025, 0, 26), false)).toBe('26 ene 2025')
    expect(formatPointDateShort(Date.UTC(2025, 0, 26, 13, 15), true)).toMatch(/^26 ene, \d{2}:15$/)
  })
})
