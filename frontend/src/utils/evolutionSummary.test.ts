import { describe, expect, it } from 'vitest'
import type { EvolutionPoint } from './evolutionSeries'
import { applyLiveToday, flowMarkers, maxDrawdown, periodSummary } from './evolutionSummary'

// Resumen del periodo del gráfico de evolución (#214).
const D = 86_400_000
const H = 3_600_000
const pt = (i: number, stepPct: number | null, pnl: number, extra: Partial<EvolutionPoint> = {}): EvolutionPoint =>
  ({ x: i * D, pct: 0, pnl, value: 100, stepPct, flow: 0, live: false, ...extra })

describe('periodSummary — mejor y peor día', () => {
  const points = [pt(0, 1, 1), pt(1, 4, 5), pt(2, -3, 2), pt(3, 0.5, 2.5, { pct: 2.4 })]
  it('elige el día de mayor y menor rentabilidad con su P&L del día', () => {
    const s = periodSummary(points, false)!
    expect(s.best).toEqual({ x: 1 * D, pct: 4, pnl: 4 })
    expect(s.worst).toEqual({ x: 2 * D, pct: -3, pnl: -3 })
    expect(s.pct).toBe(2.4)
    expect(s.pnl).toBe(2.5)
  })
  it('sin días negativos no hay «peor día» ni, sin positivos, «mejor día»', () => {
    expect(periodSummary([pt(0, 1, 1), pt(1, 2, 3)], false)!.worst).toBeNull()
    expect(periodSummary([pt(0, -1, -1)], false)!.best).toBeNull()
    expect(periodSummary([], false)).toBeNull()
  })
})

describe('periodSummary — 24H por horas', () => {
  it('encadena los tramos de 15 min de cada hora; el punto en punto cierra la hora anterior', () => {
    const base = Date.UTC(2026, 9, 15, 10)
    const q = (min: number, stepPct: number | null, pnl: number): EvolutionPoint =>
      ({ x: base + min * 60_000, pct: 0, pnl, value: 100, stepPct, flow: 0, live: false })
    const points = [q(0, null, 0), q(15, 1, 1), q(30, 1, 2), q(45, 1, 3), q(60, 1, 4), q(75, -5, -1)]
    const s = periodSummary(points, true)!
    expect(s.best?.x).toBe(base)                       // 10:00–11:00, cuatro tramos de +1 %
    expect(s.best?.pct).toBeCloseTo(4.0604, 3)
    expect(s.best?.pnl).toBe(4)
    expect(s.worst).toMatchObject({ x: base + H, pnl: -5 })
    expect(s.worst?.pct).toBeCloseTo(-5, 9)
  })
})

describe('maxDrawdown', () => {
  it('mayor caída desde un máximo del índice de rentabilidad, con sus fechas', () => {
    // 100 → 110 → 88 → 99 → 121: caída del 20 % entre el día 1 y el 2.
    const dd = maxDrawdown([pt(0, 0, 0), pt(1, 10, 0), pt(2, -20, 0), pt(3, 12.5, 0), pt(4, 22.2222, 0)])
    expect(dd?.pct).toBeCloseTo(-20, 6)
    expect(dd?.fromX).toBe(1 * D)
    expect(dd?.toX).toBe(2 * D)
  })
  it('una retirada no es una caída: solo cuenta la rentabilidad', () => {
    expect(maxDrawdown([pt(0, 0, 0, { value: 1000 }), pt(1, 0, 0, { value: 100, flow: -900 })])).toBeNull()
  })
})

describe('flowMarkers', () => {
  it('solo los puntos con depósitos o retiradas de capital', () => {
    const points = [pt(0, 0, 0), pt(1, 0, 0, { flow: 500 }), pt(2, 0, 0, { flow: -0.001 }), pt(3, 0, 0, { flow: -200 })]
    expect(flowMarkers(points).map(p => p.flow)).toEqual([500, -200])
  })
  it('en periodos largos se quedan los de mayor importe, en orden cronológico', () => {
    const many = Array.from({ length: 30 }, (_, i) => pt(i, 0, 0, { flow: i % 2 ? i : -i }))
    const top = flowMarkers(many, 3)
    expect(top.map(p => p.flow)).toEqual([27, -28, 29])
  })
})

describe('applyLiveToday', () => {
  const series = [pt(0, 0, 0, { pct: 10 }), pt(1, 1, 20, { pct: 11.1, live: true, value: 220 })]
  it('TWR: encadena la rentabilidad de hoy en vivo sobre la de ayer', () => {
    const r = applyLiveToday(series, { value: 230, pnl: 30, pct: 2 }, 'twr')
    expect(r[1]).toMatchObject({ value: 230, pnl: 30, stepPct: 2 })
    expect(r[1].pct).toBeCloseTo(12.2, 6)              // 1,10 × 1,02 − 1
    expect(r[0]).toBe(series[0])
  })
  it('sobre capital aportado: escala el % del servidor con el P&L en vivo', () => {
    expect(applyLiveToday(series, { value: 230, pnl: 40, pct: 2 }, 'peakCapital')[1].pct).toBeCloseTo(22.2, 6)
  })
  it('sin dato en vivo o si el último punto no es hoy, no cambia nada', () => {
    expect(applyLiveToday(series, null, 'twr')).toEqual(series)
    expect(applyLiveToday([pt(0, 0, 0)], { value: 1, pnl: 1, pct: 1 }, 'twr')).toEqual([pt(0, 0, 0)])
  })
})
