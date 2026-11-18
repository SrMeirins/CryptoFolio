import { describe, expect, it } from 'vitest'
import type { CalendarDay } from './pnlCalendar'
import { barrasActivos, ordinal, patronSemanal, puestoDelDia } from './calendarioDia'

const dia = (date: string, pnl: number, extra: Partial<CalendarDay> = {}): CalendarDay => ({ date, pnl, pct: null, complete: true, live: false, ...extra })

describe('puestoDelDia (#512)', () => {
  const mes = [dia('2026-11-02', 10), dia('2026-11-03', 30), dia('2026-11-04', -5), dia('2026-11-05', -20), dia('2026-11-06', 0), dia('2026-11-07', 99, { complete: false, live: true })]
  it('puesto entre los mejores si gana y entre los peores si pierde; hoy no cuenta', () => {
    expect(puestoDelDia(mes, '2026-11-02')).toMatchObject({ puesto: 2, sentido: 'mejor', de: 5 })
    expect(puestoDelDia(mes, '2026-11-05')).toMatchObject({ puesto: 1, sentido: 'peor', posicion: 0 })
    expect(puestoDelDia(mes, '2026-11-03')?.posicion).toBe(1)
  })
  it('sin puesto para un día plano, en curso o sin dato', () => {
    expect(puestoDelDia(mes, '2026-11-06')).toBeNull()
    expect(puestoDelDia(mes, '2026-11-07')).toBeNull()
    expect(puestoDelDia(mes, '2026-11-20')).toBeNull()
  })
  it('ordinal', () => expect(ordinal(3)).toBe('3.º'))
})

describe('patronSemanal', () => {
  it('media por día de la semana de los días cerrados, de lunes a domingo', () => {
    const p = patronSemanal([dia('2026-11-16', 10), dia('2026-11-23', 20), dia('2026-11-22', -4), dia('2026-11-17', 5, { complete: false }), dia('2026-11-18', 7, { live: true })])
    expect(p).toHaveLength(7)
    expect(p[0]).toEqual({ dia: 0, media: 15, dias: 2 })   // lunes
    expect(p[6]).toEqual({ dia: 6, media: -4, dias: 1 })   // domingo
    expect(p[1]).toEqual({ dia: 1, media: null, dias: 0 }) // martes sin cerrar
    expect(p[2].dias).toBe(0)                              // miércoles en curso
  })
})

describe('barrasActivos', () => {
  it('de mayor ganancia a mayor pérdida, sin ceros, con su fracción del mayor importe', () => {
    expect(barrasActivos([{ asset: 'A', pnl: -40 }, { asset: 'B', pnl: 20 }, { asset: 'C', pnl: 0 }, { asset: 'D', pnl: 10 }])).toEqual([
      { asset: 'B', pnl: 20, fraccion: 0.5 },
      { asset: 'D', pnl: 10, fraccion: 0.25 },
      { asset: 'A', pnl: -40, fraccion: 1 },
    ])
  })
})
