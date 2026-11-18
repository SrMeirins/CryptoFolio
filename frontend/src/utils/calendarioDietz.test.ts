import { describe, expect, it } from 'vitest'
import { dietzModificado, extremosAnio, totalMes, totalTramo, totalesAnio, type DiaValorado } from './calendarioDietz'

// Datos sintéticos.
const dia = (date: string, value: number, pnl: number, flujo = 0, extra: Partial<DiaValorado> = {}): DiaValorado => ({
  date, value, pnl, pct: null, complete: true, live: false, inflow: Math.max(0, flujo), outflow: Math.max(0, -flujo), ...extra,
})

describe('dietzModificado (#512)', () => {
  it('sin flujos es el P&L sobre el valor inicial', () => {
    expect(dietzModificado(1000, [dia('2026-07-01', 1010, 10), dia('2026-07-02', 990, -20)])).toBe(-1)
  })
  it('pondera cada flujo por el tiempo que estuvo invertido, como el backend', () => {
    // Día 1: +1 % sobre 100; día 2 se depositan 10.000 y se pierde un 1 %.
    const dias = [dia('2026-07-01', 101, 1), dia('2026-07-02', 9_999.9, -101.1, 10_000)]
    // Base = 100 + (2·10.000 − 2·10.000) / 2 = 100: pierde mucho más de lo que había al principio.
    expect(dietzModificado(100, dias)).toBeCloseTo(-100.1, 4)
  })
  it('con una base ínfima se queda en 0', () => {
    expect(dietzModificado(0, [dia('2026-07-01', 0.5, 0.5)])).toBe(0)
  })
})

describe('totalTramo y totalMes', () => {
  // Signo del % igual que el del importe aunque haya flujos (el caso de julio con TWR).
  const historia = [
    dia('2026-06-30', 10_000, 0),
    dia('2026-07-01', 9_900, -100),           // -1 % con mucho capital
    dia('2026-07-02', 100, 2, -9_802),        // se retira casi todo; el resto gana un 2 %
    dia('2026-07-03', 102, 2),
  ]
  it('suma el P&L y toma el valor del día anterior como base', () => {
    const t = totalMes(historia, { year: 2026, month: 7 })!
    expect(t).toMatchObject({ pnl: -96, dias: 3, enCurso: false })
    expect(Math.sign(t.pct)).toBe(-1)
  })
  it('sin días en el tramo, null; el día en curso cuenta y se marca', () => {
    expect(totalTramo(historia, '2026-08-01', '2026-08-31')).toBeNull()
    const conHoy = [...historia, dia('2026-07-04', 110, 8, 0, { complete: false, live: true })]
    expect(totalMes(conHoy, { year: 2026, month: 7 })).toMatchObject({ pnl: -88, dias: 4, enCurso: true })
  })
})

describe('totalesAnio y extremosAnio', () => {
  const historia = [dia('2026-01-05', 100, 10), dia('2026-01-06', 95, -5), dia('2026-03-01', 97, 2), dia('2026-03-02', 90, -7)]
  it('12 meses con total, Dietz y P&L de cada día; null en los meses sin datos', () => {
    const r = totalesAnio(historia, 2026)
    expect(r).toHaveLength(12)
    expect(r[0]).toMatchObject({ pnl: 5, dias: 2, ym: { year: 2026, month: 1 } })
    expect(r[0]!.diarios).toHaveLength(31)
    expect(r[0]!.diarios[4]).toBe(10)
    expect(r[0]!.diarios[0]).toBeNull()
    expect(r[1]).toBeNull()
    expect(r[2]?.pnl).toBe(-5)
  })
  it('mejor y peor mes por importe', () => {
    expect(extremosAnio(totalesAnio(historia, 2026))).toEqual({ mejor: 0, peor: 2 })
    expect(extremosAnio([null, null])).toEqual({ mejor: null, peor: null })
  })
})
