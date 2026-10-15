import { describe, expect, it } from 'vitest'
import type { EvolutionPoint } from './evolutionSeries'
import { applyLiveToday, flowBuckets, flowUnit, maxDrawdown, minBase, periodSummary } from './evolutionSummary'

// Resumen del periodo del gráfico de evolución (#214).
const D = 86_400_000
const H = 3_600_000
const pt = (i: number, stepPct: number | null, pnl: number, extra: Partial<EvolutionPoint> = {}): EvolutionPoint =>
  ({ x: i * D, pct: 0, pnl, value: 100, stepPct, deposit: 0, withdrawal: 0, live: false, ...extra })

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

describe('periodSummary — días con capital ínfimo (#245)', () => {
  // Cartera pequeña al principio (80) que se pierde entera; después, cartera de 10 000.
  const points = [
    pt(0, null, 0, { value: 0.01 }),
    pt(1, 30, 19, { value: 80, deposit: 61 }),     // +30 % sobre 61: capital ínfimo
    pt(2, -99.99, -61, { value: 0.01 }),           // −100 % sobre 80: capital ínfimo
    pt(3, null, -61, { value: 10_000, deposit: 10_000 }),
    pt(4, 2, 139, { value: 10_200 }),
    pt(5, -1, 37, { value: 10_098 }),
  ]

  it('el umbral es el 1 % del valor máximo del periodo, con un mínimo absoluto', () => {
    expect(minBase(points)).toBeCloseTo(102, 6)
    expect(minBase([pt(0, 1, 0, { value: 10 })])).toBe(1)
  })

  it('mejor y peor día por importe, como el calendario', () => {
    const s = periodSummary(points, false)!
    expect(s.best).toEqual({ x: 4 * D, pct: 2, pnl: 200 })
    expect(s.worst).toEqual({ x: 5 * D, pct: -1, pnl: -102 })
  })

  it('un día de capital ínfimo puede salir por importe, pero sin %', () => {
    // Igual, pero sin días negativos con la cartera grande.
    const s = periodSummary(points.slice(0, 5), false)!
    expect(s.worst).toEqual({ x: 2 * D, pct: null, pnl: -80 })
  })

  it('la máxima caída ignora esos días y no llega al −100 %', () => {
    const dd = maxDrawdown(points)!
    expect(dd.pct).toBeCloseTo(-1, 6)
    expect(dd.fromX).toBe(4 * D)
    expect(dd.toX).toBe(5 * D)
  })

  it('sin días válidos no hay máxima caída', () => {
    expect(maxDrawdown(points.slice(0, 4))).toBeNull()
  })

  it('el umbral es relativo al periodo: si toda la cartera era pequeña, su % sí cuenta', () => {
    const s = periodSummary(points.slice(0, 3), false)!
    expect(s.worst?.pct).toBeCloseTo(-99.99, 6)
  })

  it('una pérdida real sobre capital suficiente sí cuenta', () => {
    const crash = [pt(0, null, 0, { value: 1000 }), pt(1, -60, -600, { value: 400 })]
    expect(periodSummary(crash, false)!.worst).toEqual({ x: 1 * D, pct: -60, pnl: -600 })
    expect(maxDrawdown(crash)?.pct).toBeCloseTo(-60, 6)
  })
})

describe('periodSummary — 24H por horas', () => {
  it('encadena los tramos de 15 min de cada hora; el punto en punto cierra la hora anterior', () => {
    const base = Date.UTC(2026, 9, 15, 10)
    const q = (min: number, stepPct: number | null, pnl: number): EvolutionPoint =>
      ({ x: base + min * 60_000, pct: 0, pnl, value: 100, stepPct, deposit: 0, withdrawal: 0, live: false })
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
    expect(maxDrawdown([pt(0, 0, 0, { value: 1000 }), pt(1, 0, 0, { value: 100, withdrawal: 900 })])).toBeNull()
  })
})

describe('flowBuckets', () => {
  it('periodos cortos: un marcador por día con entradas y salidas por separado', () => {
    const points = [pt(0, 0, 0), pt(1, 0, 0, { deposit: 500, withdrawal: 50 }), pt(2, 0, 0, { withdrawal: 0.001 }), pt(3, 0, 0, { withdrawal: 200 })]
    const b = flowBuckets(points, false)
    expect(b.map(x => [x.start, x.deposits, x.withdrawals])).toEqual([[1 * D, 500, 50], [3 * D, 0, 200]])
    expect(b[0].unit).toBe('day')
  })

  it('periodos largos: agrupa por mes sin descartar ningún movimiento; la suma cuadra', () => {
    const start = Date.UTC(2022, 0, 3)
    const points = Array.from({ length: 600 }, (_, i) => ({
      ...pt(0, 0, 0), x: start + i * D,
      deposit: i % 7 === 0 ? 100 : 0,
      withdrawal: i % 50 === 0 ? 10 : 0,
    }))
    const b = flowBuckets(points, false)
    expect(b[0].unit).toBe('month')
    expect(b.reduce((s, x) => s + x.deposits, 0)).toBeCloseTo(points.reduce((s, p) => s + p.deposit, 0), 6)
    expect(b.reduce((s, x) => s + x.withdrawals, 0)).toBeCloseTo(points.reduce((s, p) => s + p.withdrawal, 0), 6)
    expect(b.every(x => new Date(x.start).getUTCDate() === 1)).toBe(true)
  })

  it('el marcador se ancla en el día de mayor movimiento del grupo', () => {
    const start = Date.UTC(2025, 0, 6)   // lunes
    const points = Array.from({ length: 300 }, (_, i) => ({ ...pt(0, 0, 0), x: start + i * D }))
    points[1] = { ...points[1], deposit: 10 }
    points[3] = { ...points[3], withdrawal: 400 }
    const [b] = flowBuckets(points, false)
    expect(b.unit).toBe('week')
    expect(b.start).toBe(start)
    expect(b.anchor.x).toBe(start + 3 * D)
    expect(b.days).toBe(2)
  })

  it('granularidad según la duración; en 24H siempre por tramo', () => {
    const span = (days: number) => [pt(0, 0, 0), { ...pt(0, 0, 0), x: days * D }]
    expect(flowUnit(span(180), false)).toBe('day')
    expect(flowUnit(span(365), false)).toBe('week')
    expect(flowUnit(span(1700), false)).toBe('month')
    expect(flowUnit(span(1700), true)).toBe('day')
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
