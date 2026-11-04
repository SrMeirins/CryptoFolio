import { describe, expect, it } from 'vitest'
import { ahorroDe, claveImporte, importesPendientes, MAX_POR_PETICION, trocear } from './ahorroIrpf'

// Ahorro de IRPF en Planificar (#533). Datos sintéticos.
describe('importesPendientes', () => {
  it('redondea al euro, quita repetidos, ordena y salta los que ya están en caché', () => {
    const cache = new Map([[-100, 10]])
    expect(importesPendientes([-100.4, -99.6, -250.2, -250.4, -30.5], cache)).toEqual([-250, -30])
  })
  it('con todo en caché no pide nada, aunque los precios muevan los céntimos', () => {
    const cache = new Map([[-100, 10], [-50, 5]])
    expect(importesPendientes([-100.2, -49.8], cache)).toEqual([])
  })
})

describe('trocear', () => {
  it('sin límite fijo de 50: reparte en trozos dentro del máximo de la API', () => {
    const muchos = Array.from({ length: 450 }, (_, i) => -i - 1)
    const trozos = trocear(muchos)
    expect(trozos.map(t => t.length)).toEqual([MAX_POR_PETICION, MAX_POR_PETICION, 50])
    expect(trozos.flat()).toEqual(muchos)
  })
})

describe('ahorroDe', () => {
  const cache = new Map([[-100, 70], [-20, 100]])
  it('cuota sin la pérdida menos cuota con ella', () => {
    expect(ahorroDe(-100.3, 100, cache)).toBe(30)
  })
  it('nunca negativo y 0 si no hay ganancias que compensar', () => {
    expect(ahorroDe(-20, 100, cache)).toBe(0)
  })
  it('null mientras no está calculado o sin cuota base', () => {
    expect(ahorroDe(-500, 100, cache)).toBeNull()
    expect(ahorroDe(-100, null, cache)).toBeNull()
  })
  it('la clave es el importe al euro', () => {
    expect(claveImporte(-99.5)).toBe(-99)
    expect(claveImporte(-99.6)).toBe(-100)
  })
})
