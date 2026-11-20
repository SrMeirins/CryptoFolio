import { describe, expect, it } from 'vitest'
import { DIAS_ANIO, extremosMeses, medidasRiesgo, rejillaPeriodos } from './rendimiento'
import type { DiaValorado } from './calendarioDietz'

// Series sintéticas.
const d = (date: string, pct: number | null, live = false) => ({ date, pct, live })

describe('medidasRiesgo: máxima caída (#517)', () => {
  it('referencia: +10 %, −20 %, −10 % y vuelta al máximo', () => {
    // Índice: 1,10 (máximo), 0,88, 0,792 (mínimo: −28 %); después +38,8889 % recupera 1,10.
    const r = medidasRiesgo([d('2026-01-01', 10), d('2026-01-02', -20), d('2026-01-03', -10), d('2026-01-04', 38.888889), d('2026-01-05', 1)])
    expect(r.maxima?.pct).toBeCloseTo(-28, 4)
    expect(r.maxima).toMatchObject({ desde: '2026-01-01', hasta: '2026-01-03', recuperado: '2026-01-04', diasCaida: 2, diasRecuperacion: 1, faltaPct: null })
    expect(r.actual?.pct).toBe(0)
  })
  it('caída abierta: sin recuperación y lo que falta para volver al máximo', () => {
    const r = medidasRiesgo([d('2026-01-01', 0), d('2026-01-02', -50), d('2026-01-03', 20)])
    expect(r.maxima).toMatchObject({ pct: -50, recuperado: null, diasRecuperacion: null })
    // Índice 0,6: hay que subir un 66,67 % para volver a 1.
    expect(r.maxima?.faltaPct).toBeCloseTo(66.6667, 3)
    expect(r.actual?.pct).toBeCloseTo(-40, 6)
  })
  it('el día en curso cuenta en la caída (como en Evolución) pero no en la volatilidad; sin base, no cuenta', () => {
    const r = medidasRiesgo([d('2026-01-01', 1), d('2026-01-02', null), d('2026-01-03', 2), d('2026-01-04', -90, true)])
    expect(r.maxima?.pct).toBeCloseTo(-90, 6)
    expect(r.diasMedidos).toBe(2)
  })
  it('sin caídas, null', () => {
    expect(medidasRiesgo([d('2026-01-01', 1), d('2026-01-02', 2)]).maxima).toBeNull()
  })
})

describe('medidasRiesgo: volatilidad', () => {
  it('desviación típica muestral de los rendimientos diarios, anualizada con la raíz de 365', () => {
    // Rendimientos 1 %, −1 %, 1 %, −1 %: media 0, varianza muestral 4·0,0001/3.
    const r = medidasRiesgo([d('2026-01-01', 1), d('2026-01-02', -1), d('2026-01-03', 1), d('2026-01-04', -1)])
    const diaria = Math.sqrt(0.0004 / 3) * 100
    expect(r.volatilidadDiaria).toBeCloseTo(diaria, 9)
    expect(r.volatilidadAnual).toBeCloseTo(diaria * Math.sqrt(DIAS_ANIO), 9)
  })
  it('con menos de dos rendimientos, sin volatilidad', () => {
    expect(medidasRiesgo([d('2026-01-01', 3)]).volatilidadAnual).toBeNull()
  })
})

const v = (date: string, value: number, pnl: number): DiaValorado => ({ date, value, pnl, pct: null, complete: true, live: false, inflow: 0, outflow: 0 })

describe('rejillaPeriodos y extremosMeses', () => {
  const historia = [v('2025-12-31', 100, 0), v('2026-01-15', 110, 10), v('2026-02-10', 99, -11), v('2026-04-02', 108.9, 9.9)]
  it('una fila por año con meses, trimestres y año por Dietz', () => {
    const [f2025, f2026] = rejillaPeriodos(historia)
    expect(f2025.year).toBe(2025)
    expect(f2026.meses[0]?.pct).toBeCloseTo(10, 6)
    expect(f2026.meses[1]?.pct).toBeCloseTo(-10, 6)
    expect(f2026.meses[2]).toBeNull()
    expect(f2026.trimestres[0]?.pnl).toBe(-1)
    expect(f2026.anio?.pct).toBeCloseTo(8.9, 6)
  })
  it('mejor y peor mes del rango', () => {
    const r = extremosMeses(historia, '2026-01-01', '2026-12-31')
    expect(r.mejor?.mes).toBe('2026-01')
    expect(r.peor?.mes).toBe('2026-02')
  })
})
