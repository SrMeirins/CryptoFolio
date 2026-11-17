import { describe, expect, it } from 'vitest'
import { curvaEn, pasoTeclado } from './curvaSimulador'

// Curva del simulador (#529).
const pts = [
  { price: 0, netGainLoss: -10, irpf: 0, netoEnMano: 0, resultadoNeto: -10 },
  { price: 2, netGainLoss: 10, irpf: 2, netoEnMano: 18, resultadoNeto: 8 },
]

describe('curvaEn', () => {
  it('interpola entre puntos y no sale de la curva', () => {
    expect(curvaEn(pts, 1)).toEqual({ resultadoNeto: -1, netoEnMano: 9 })
    expect(curvaEn(pts, 2)).toEqual({ resultadoNeto: 8, netoEnMano: 18 })
    expect(curvaEn(pts, 3)).toBeNull()
  })
})

describe('pasoTeclado', () => {
  it('flechas 1 % del precio actual, Mayús 10 %, Inicio vuelve al actual', () => {
    expect(pasoTeclado('ArrowRight', false, 2, 2)).toBeCloseTo(2.02, 10)
    expect(pasoTeclado('ArrowLeft', true, 2, 2)).toBeCloseTo(1.8, 10)
    expect(pasoTeclado('Home', false, 3, 2)).toBe(2)
    expect(pasoTeclado('ArrowLeft', false, 0.001, 2)).toBe(0)
    expect(pasoTeclado('a', false, 2, 2)).toBeNull()
  })
})
