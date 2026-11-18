import { describe, expect, it } from 'vitest'
import type { CalendarDay } from './pnlCalendar'
import { agrupacionAuto, barrasPeriodo, diasDelPeriodo, lunesDe, rachaMasLarga, resumenPeriodo } from './pnlPeriodo'

// Datos sintéticos.
const dia = (date: string, pnl: number, extra: Partial<CalendarDay> = {}): CalendarDay =>
  ({ date, pnl, pct: null, complete: true, live: false, ...extra })

describe('diasDelPeriodo (#511)', () => {
  const days = [dia('2026-10-01', 1), dia('2026-10-02', 2, { complete: false }), dia('2026-10-03', 3), dia('2026-10-04', 4, { complete: false, live: true })]
  it('recorta al rango y descarta los días sin dato, pero no el día en curso', () => {
    expect(diasDelPeriodo(days, '2026-10-02', '2026-10-04').map(d => d.date)).toEqual(['2026-10-03', '2026-10-04'])
    expect(diasDelPeriodo(days, undefined, '2026-10-03').map(d => d.date)).toEqual(['2026-10-01', '2026-10-03'])
  })
})

describe('agrupacionAuto', () => {
  it('diaria hasta 92 días, semanal hasta un año y mensual después', () => {
    expect(agrupacionAuto(90)).toBe('dia')
    expect(agrupacionAuto(93)).toBe('semana')
    expect(agrupacionAuto(366)).toBe('semana')
    expect(agrupacionAuto(367)).toBe('mes')
  })
})

describe('lunesDe', () => {
  it('lleva cualquier día a su lunes', () => {
    expect(lunesDe('2026-11-18')).toBe('2026-11-16')
    expect(lunesDe('2026-11-16')).toBe('2026-11-16')
    expect(lunesDe('2026-11-22')).toBe('2026-11-16')
  })
})

describe('barrasPeriodo', () => {
  const dias = [dia('2026-10-30', 10), dia('2026-10-31', -4.555), dia('2026-11-01', 2), dia('2026-11-02', 1, { complete: false, live: true })]
  it('la suma de las barras es el acumulado, en cualquier agrupación', () => {
    for (const a of ['dia', 'semana', 'mes'] as const) {
      const barras = barrasPeriodo(dias, a)
      const suma = Math.round(barras.reduce((s, b) => s + b.pnl, 0) * 100) / 100
      expect(suma).toBe(resumenPeriodo(dias).total)
      expect(barras.at(-1)!.acumulado).toBe(resumenPeriodo(dias).total)
    }
  })
  it('agrupa por semana (lunes) y por mes, y marca la barra con el día en curso', () => {
    expect(barrasPeriodo(dias, 'semana').map(b => [b.key, b.desde, b.hasta, b.enCurso])).toEqual([
      ['2026-10-26', '2026-10-30', '2026-11-01', false],
      ['2026-11-02', '2026-11-02', '2026-11-02', true],
    ])
    expect(barrasPeriodo(dias, 'mes').map(b => [b.key, b.pnl])).toEqual([['2026-10-01', 5.45], ['2026-11-01', 3]])
  })
  it('sin días, sin barras', () => {
    expect(barrasPeriodo([], 'dia')).toEqual([])
  })
})

describe('resumenPeriodo', () => {
  it('cuenta y promedia solo días cerrados; el total incluye hoy', () => {
    const r = resumenPeriodo([dia('2026-10-01', 10), dia('2026-10-02', -5), dia('2026-10-03', 0), dia('2026-10-04', 20), dia('2026-10-05', 99, { complete: false, live: true })])
    expect(r).toMatchObject({ total: 124, verdes: 2, rojos: 1, planos: 1, mediaVerde: 15, mediaRoja: -5 })
    expect(r.mejor?.date).toBe('2026-10-04')
    expect(r.peor?.date).toBe('2026-10-02')
  })
  it('sin días verdes o rojos, sin extremos ni medias', () => {
    expect(resumenPeriodo([dia('2026-10-01', 3)])).toMatchObject({ peor: null, mediaRoja: null, rachaRoja: null })
    expect(resumenPeriodo([])).toMatchObject({ total: 0, verdes: 0, mejor: null, rachaVerde: null, mediaVerde: null })
  })
})

describe('rachaMasLarga', () => {
  it('indica tipo, duración y fechas; un día de otro signo la corta', () => {
    const dias = [dia('2026-10-01', 1), dia('2026-10-02', 1), dia('2026-10-03', -1), dia('2026-10-04', 1), dia('2026-10-05', 1), dia('2026-10-06', 1)]
    expect(rachaMasLarga(dias, 'up')).toEqual({ signo: 'up', dias: 3, desde: '2026-10-04', hasta: '2026-10-06' })
    expect(rachaMasLarga(dias, 'down')).toEqual({ signo: 'down', dias: 1, desde: '2026-10-03', hasta: '2026-10-03' })
  })
  it('un día sin dato (hueco en las fechas) o plano corta la racha', () => {
    const conHueco = [dia('2026-10-01', 1), dia('2026-10-02', 1), dia('2026-10-04', 1)]
    expect(rachaMasLarga(conHueco, 'up')).toMatchObject({ dias: 2, desde: '2026-10-01' })
    expect(rachaMasLarga([dia('2026-10-01', 1), dia('2026-10-02', 0), dia('2026-10-03', 1)], 'up')).toMatchObject({ dias: 1, desde: '2026-10-03' })
  })
  it('con empate, la más reciente', () => {
    expect(rachaMasLarga([dia('2026-10-01', -1), dia('2026-10-03', -2)], 'down')).toMatchObject({ desde: '2026-10-03' })
  })
})
