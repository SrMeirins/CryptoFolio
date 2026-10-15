import { describe, expect, it } from 'vitest'
import type { DailyPnlDay } from '../api/portfolio'
import { evolutionQuery, formatPointDate, fromDaily, fromIntraday } from './evolutionSeries'
import { metricFor, periodFrom } from './pnlChart'

// Periodos del gráfico de evolución (#215).
const TODAY = '2026-10-15'

describe('periodos', () => {
  it('24H pide la serie intradía; el resto, la diaria desde su primer día', () => {
    expect(evolutionQuery('24H', TODAY, null)).toEqual({ intraday: true })
    expect(evolutionQuery('7D', TODAY, null)).toEqual({ intraday: false, from: '2026-10-09' })
    expect(evolutionQuery('Todo', TODAY, null)).toEqual({ intraday: false, from: undefined })
  })

  it('YTD empieza el 1 de enero del año en curso', () => {
    expect(periodFrom('YTD', TODAY)).toBe('2026-01-01')
    expect(evolutionQuery('YTD', '2027-01-01', null)).toEqual({ intraday: false, from: '2027-01-01' })
    expect(metricFor('YTD')).toBe('twr')
  })

  it('rango personalizado: fechas elegidas, acotadas a hoy y con un solo día si falta el final', () => {
    expect(evolutionQuery('Rango', TODAY, { from: '2026-03-01', to: '2026-04-15' })).toEqual({ intraday: false, from: '2026-03-01', to: '2026-04-15' })
    expect(evolutionQuery('Rango', TODAY, { from: '2026-10-01', to: '2026-12-31' })).toEqual({ intraday: false, from: '2026-10-01', to: TODAY })
    expect(evolutionQuery('Rango', TODAY, { from: '2026-05-05', to: '' })).toEqual({ intraday: false, from: '2026-05-05', to: '2026-05-05' })
  })
})

describe('serie común de P&L y Valor', () => {
  const day = (date: string, value: number, pnl: number, pct: number, live = false): DailyPnlDay => ({
    date, value, pnl, pct, inflow: 0, outflow: 0, netCapitalFlow: 0, cumulativePct: pct, cumulativeDietzPct: pct,
    cumulativePeakCapitalPct: pct / 2, complete: true, live,
  })

  it('diaria: fecha a medianoche UTC, valor del día y métrica del periodo', () => {
    const days = [day('2026-10-14', 100, 0, 0), day('2026-10-15', 110, 10, 10, true)]
    expect(fromDaily(days, '7D')).toEqual([
      { x: Date.UTC(2026, 9, 14), pct: 0, pnl: 0, value: 100, stepPct: 0, flow: 0, live: false },
      { x: Date.UTC(2026, 9, 15), pct: 10, pnl: 10, value: 110, stepPct: 10, flow: 0, live: true },
    ])
    expect(fromDaily(days, 'Todo')[1].pct).toBe(5)   // sobre capital aportado
  })

  it('intradía: instante exacto de cada punto', () => {
    expect(fromIntraday([{ at: '2026-10-15T09:15:00.000Z', value: 5, pnl: 1, pct: 2, stepPct: 0.5, flow: 3, live: false }]))
      .toEqual([{ x: Date.UTC(2026, 9, 15, 9, 15), pct: 2, pnl: 1, value: 5, stepPct: 0.5, flow: 3, live: false }])
  })
})

describe('formatPointDate', () => {
  it('fecha larga en la serie diaria y día con hora de Madrid en 24H', () => {
    expect(formatPointDate(Date.UTC(2026, 9, 15), false)).toBe('15 de octubre de 2026')
    expect(formatPointDate(Date.UTC(2026, 9, 15, 12, 30), true)).toMatch(/^15 oct\.?, 14:30$/)
  })
})
