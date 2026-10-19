import { describe, expect, it } from 'vitest'
import { CAMPO_LABEL, parseImporte, umbralSiguiente721 } from './declaraciones'

// Ejercicios declarados (#311).
describe('umbralSiguiente721', () => {
  it('sin presentación previa, el umbral', () => {
    expect(umbralSiguiente721(50_000, null)).toBe(50_000)
  })
  it('con presentación previa, lo presentado + 20.000 € (nunca por debajo del umbral)', () => {
    expect(umbralSiguiente721(50_000, { valor: 60_000 })).toBe(80_000)
    expect(umbralSiguiente721(50_000, { valor: 10_000 })).toBe(50_000)
  })
  it('etiqueta para cada cifra de la Renta', () => {
    expect(Object.keys(CAMPO_LABEL)).toEqual(['ganancias', 'perdidas', 'neto', 'rendimientos', 'operaciones', 'base', 'cuota'])
  })
})

describe('parseImporte', () => {
  it('formatos españoles y con punto decimal', () => {
    expect(parseImporte('60.000')).toBe(60000)
    expect(parseImporte('60.000,50')).toBe(60000.5)
    expect(parseImporte('60000,5')).toBe(60000.5)
    expect(parseImporte('60000.50')).toBe(60000.5)
    expect(parseImporte('1.234.567')).toBe(1234567)
    expect(parseImporte(' 60.000 € ')).toBe(60000)
  })
  it('lo que no es un número', () => {
    expect(parseImporte('')).toBeNaN()
    expect(parseImporte('-5')).toBeNaN()
    expect(parseImporte('abc')).toBeNaN()
  })
})
