import { describe, expect, it } from 'vitest'
import { fieldSparkline, returnSparkline, sparklineChange, sparklinePoints, unrealizedSparkline, valueSparkline } from './sparkline'

// Mini-gráfico de la tarjeta «Valor» (#251).
const day = (i: number, value: number, live = false) => ({ date: `2026-01-${String(i).padStart(2, '0')}`, value, live })

describe('valueSparkline', () => {
  it('últimos N días; el día en vivo toma el valor actual', () => {
    const series = [day(1, 10), day(2, 20), day(3, 30), day(4, 40, true)]
    expect(valueSparkline(series, 45, 3)).toEqual([20, 30, 45])
  })
  it('sin día en vivo o sin valor actual, la serie tal cual', () => {
    expect(valueSparkline([day(1, 10), day(2, 20)], 99, 30)).toEqual([10, 20])
    expect(valueSparkline([day(1, 10), day(2, 20, true)], null, 30)).toEqual([10, 20])
    expect(valueSparkline([], 5)).toEqual([])
  })
})

describe('sparklinePoints', () => {
  it('reparte en horizontal y escala en vertical con margen (arriba el máximo)', () => {
    expect(sparklinePoints([0, 10], 100, 20, 2)).toBe('0.0,18.0 100.0,2.0')
  })
  it('serie plana centrada en la base sin dividir por cero; menos de dos valores, vacío', () => {
    expect(sparklinePoints([5, 5, 5], 10, 10, 0)).toBe('0.0,10.0 5.0,10.0 10.0,10.0')
    expect(sparklinePoints([5], 10, 10)).toBe('')
  })
})

describe('sparklineChange', () => {
  it('variación entre extremos; null sin datos o base 0', () => {
    expect(sparklineChange([100, 90, 110])).toBeCloseTo(10, 9)
    expect(sparklineChange([0, 5])).toBeNull()
    expect(sparklineChange([5])).toBeNull()
  })
})

describe('mini gráficas de P&L y rentabilidad (#412)', () => {
  it('P&L no realizado (#507): valor menos coste de cada día y la punta es la cifra actual', () => {
    const d = (value: number, cost: number, live = false) => ({ value, cost, live })
    expect(unrealizedSparkline([d(100, 80), d(90, 80), d(120, 100, true)], 25)).toEqual([20, 10, 25])
    expect(unrealizedSparkline([d(100, 80), d(90, 80)], 25)).toEqual([20, 10])
    // Sin coste en la respuesta (API antigua), sin serie.
    expect(unrealizedSparkline([{ value: 1, live: false }, { value: 2, live: false }], 0)).toEqual([])
  })

  it('coste y EUR neto (#507): la serie de la API y la punta en vivo', () => {
    const series = [{ cost: 10, eurNet: 5, live: false }, { cost: 12, eurNet: 5, live: false }, { cost: 15, eurNet: 7, live: true }]
    expect(fieldSparkline(series, 'cost', 16)).toEqual([10, 12, 16])
    expect(fieldSparkline(series, 'eurNet', null)).toEqual([5, 5, 7])
    expect(fieldSparkline(series, 'cost', 1, 2)).toEqual([12, 1])
  })

  it('rentabilidad: la acumulada de los últimos días', () => {
    const series = Array.from({ length: 35 }, (_, i) => ({ cumulativePct: i }))
    expect(returnSparkline(series)).toEqual(Array.from({ length: 30 }, (_, i) => i + 5))
  })
})
