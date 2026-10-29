import { describe, expect, it } from 'vitest'
import { pnlSparkline, returnSparkline, sparklineChange, sparklinePoints, valueSparkline } from './sparkline'

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
  it('P&L: se reconstruye hacia atrás y la punta es la cifra actual', () => {
    expect(pnlSparkline([{ pnl: 10 }, { pnl: -5 }, { pnl: 20 }], 100)).toEqual([85, 80, 100])
  })

  it('P&L: solo los últimos días y nada sin cifra actual', () => {
    const series = Array.from({ length: 40 }, () => ({ pnl: 1 }))
    const out = pnlSparkline(series, 50)
    expect(out).toHaveLength(30)
    expect(out[29]).toBe(50)
    expect(out[0]).toBe(21)
    expect(pnlSparkline(series, null)).toEqual([])
  })

  it('rentabilidad: la acumulada de los últimos días', () => {
    const series = Array.from({ length: 35 }, (_, i) => ({ cumulativePct: i }))
    expect(returnSparkline(series)).toEqual(Array.from({ length: 30 }, (_, i) => i + 5))
  })
})
