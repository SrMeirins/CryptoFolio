import { describe, expect, it } from 'vitest'
import { calcStep } from './calcStep'

describe('calcStep', () => {
  it('devuelve 0.01 para valores nulos o negativos', () => {
    expect(calcStep(0)).toBe(0.01)
    expect(calcStep(-5)).toBe(0.01)
  })

  it('usa un paso una magnitud por debajo del valor', () => {
    expect(calcStep(250)).toBeCloseTo(10)
    expect(calcStep(1)).toBeCloseTo(0.1)
    expect(calcStep(0.5)).toBeCloseTo(0.01)
  })

  it('nunca baja de 1e-8 (precisión mínima de cripto)', () => {
    expect(calcStep(1e-12)).toBe(1e-8)
  })
})
