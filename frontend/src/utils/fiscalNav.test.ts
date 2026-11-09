import { describe, expect, it } from 'vitest'
import { avisosVistas, estadoEjercicio, ESTADO_EJERCICIO_LABEL } from './fiscalNav'

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
