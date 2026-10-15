import { describe, expect, it } from 'vitest'
import { zeroSplit } from './zeroSplit'

// Corte verde/rojo en el 0 (#231): relativo a la caja real de cada forma.
describe('zeroSplit', () => {
  it('cruza el 0: el corte cae donde está el 0 dentro del rango de cada forma', () => {
    // Datos de +20 a −80: el 0 está al 20 % desde arriba, en el área y en la línea.
    expect(zeroSplit([20, -80, 0])).toEqual({ fill: 0.2, stroke: 0.2, solid: 'up' })
  })

  it('no depende del dominio del eje (antes se usaban los ticks redondeados)', () => {
    // Con ticks de 25 a −100 el corte antiguo era 0,2; el bueno es 5/(5+95) = 0,05.
    expect(zeroSplit([5, -95]).fill).toBeCloseTo(0.05, 9)
    expect(zeroSplit([5, -95]).stroke).toBeCloseTo(0.05, 9)
  })

  it('todo positivo: el área va de la curva al 0 (todo verde); la línea no cruza', () => {
    const s = zeroSplit([10, 30, 20])
    expect(s.fill).toBe(1)
    expect(s.stroke).toBeGreaterThanOrEqual(1)
    expect(s.solid).toBe('up')
  })

  it('todo negativo: área toda roja y línea roja', () => {
    const s = zeroSplit([-10, -30])
    expect(s.fill).toBe(0)
    expect(s.stroke).toBe(0)
    expect(s.solid).toBe('down')
  })

  it('el área y la línea pueden tener cortes distintos (el área incluye el 0, la línea no)', () => {
    // Línea de 10 a −30 (corte 0,25); área igual, porque ya incluye el 0.
    expect(zeroSplit([10, -30])).toMatchObject({ fill: 0.25, stroke: 0.25 })
    // Línea de 40 a 10: el área va de 40 a 0 (todo verde); la línea, de 40 a 10 (sin 0).
    expect(zeroSplit([40, 10]).fill).toBe(1)
  })

  it('línea plana o sin datos: color sólido, sin degradado (la caja no tiene altura)', () => {
    expect(zeroSplit([0, 0])).toEqual({ fill: 1, stroke: null, solid: 'up' })
    expect(zeroSplit([-5, -5])).toMatchObject({ stroke: null, solid: 'down' })
    expect(zeroSplit([])).toEqual({ fill: 1, stroke: null, solid: 'up' })
  })
})
