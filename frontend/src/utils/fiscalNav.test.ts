import { describe, expect, it } from 'vitest'
import { avisosVistas, estadoEjercicio, ESTADO_EJERCICIO_LABEL, encajeCarrusel, repartoGananciasPerdidas } from './fiscalNav'

// Menú lateral de Fiscal (#535).
describe('estado del ejercicio (#535)', () => {
  it('en curso, declarado o por declarar según la marca de la renta', () => {
    expect(estadoEjercicio(true, false)).toBe('en-curso')
    expect(estadoEjercicio(true, true)).toBe('en-curso')
    expect(estadoEjercicio(false, true)).toBe('declarado')
    expect(estadoEjercicio(false, false)).toBe('por-declarar')
    expect(ESTADO_EJERCICIO_LABEL['por-declarar']).toBe('Por declarar')
  })
})

describe('avisos del menú: solo lo que pide acción (#535)', () => {
  it('sin acciones pendientes, ningún indicador', () => {
    expect(avisosVistas({ rentaCambiada: false, obligado721SinPresentar: false })).toEqual({})
  })

  it('renta con cifras cambiadas y Modelo 721 obligatorio sin presentar', () => {
    expect(avisosVistas({ rentaCambiada: true, obligado721SinPresentar: true })).toEqual({
      resumen: 'las cifras declaradas han cambiado',
      modelo721: 'hay que presentarlo',
    })
  })
})

describe('reparto de ganancias y pérdidas de una tarjeta (#536)', () => {
  it('porcentajes enteros que suman 100, con las pérdidas en negativo', () => {
    expect(repartoGananciasPerdidas(300, -100)).toEqual({ ganancias: 75, perdidas: 25 })
    expect(repartoGananciasPerdidas(1, -2)).toEqual({ ganancias: 33, perdidas: 67 })
  })

  it('solo ganancias o solo pérdidas', () => {
    expect(repartoGananciasPerdidas(50, 0)).toEqual({ ganancias: 100, perdidas: 0 })
    expect(repartoGananciasPerdidas(0, -50)).toEqual({ ganancias: 0, perdidas: 100 })
  })

  it('sin movimiento no hay barra', () => {
    expect(repartoGananciasPerdidas(0, 0)).toBeNull()
  })
})

describe('encaje del carrusel de ejercicios (#536)', () => {
  it('a 908 px caben 4 tarjetas completas que ocupan la fila de borde a borde', () => {
    const e = encajeCarrusel(908, 5)
    expect(e.visibles).toBe(4)
    expect(e.anchoTarjeta * 4 + 12 * 3).toBeCloseTo(908)
    expect(e.anchoTarjeta).toBeGreaterThanOrEqual(208)
  })

  it('con menos ejercicios de los que caben, se reparten todo el ancho', () => {
    const e = encajeCarrusel(908, 2)
    expect(e.visibles).toBe(2)
    expect(e.anchoTarjeta).toBeCloseTo((908 - 12) / 2)
  })

  it('siempre al menos una tarjeta, aunque el hueco sea estrecho', () => {
    expect(encajeCarrusel(150, 5).visibles).toBe(1)
    expect(encajeCarrusel(0, 5)).toEqual({ visibles: 0, anchoTarjeta: 0 })
  })
})
