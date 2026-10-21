import { describe, expect, it } from 'vitest'
import { porcentajePreparacion } from './preparacion'

// Progreso de los históricos (#334).
describe('porcentajePreparacion', () => {
  it('redondea, acota a 100 y usa el mínimo sin datos', () => {
    expect(porcentajePreparacion({ listos: 12, total: 38 })).toBe(32)
    expect(porcentajePreparacion({ listos: 40, total: 38 })).toBe(100)
    expect(porcentajePreparacion(undefined, 5)).toBe(5)
    expect(porcentajePreparacion({ listos: 0, total: 0 }, 5)).toBe(5)
    expect(porcentajePreparacion({ listos: 0, total: 10 }, 5)).toBe(5)
  })
})
