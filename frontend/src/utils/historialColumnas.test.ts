import { describe, expect, it } from 'vitest'
import { columnasHistorial, serializarColumnasHistorial, HISTORIAL_COLUMNAS_KEY } from './historialColumnas'

const TODAS = ['cantidad', 'valor', 'fee', 'wallet']

describe('columnas del Historial (#554)', () => {
  it('sin valor guardado o con uno inválido, todas', () => {
    expect(columnasHistorial(undefined)).toEqual(TODAS)
    expect(columnasHistorial({})).toEqual(TODAS)
    expect(columnasHistorial({ [HISTORIAL_COLUMNAS_KEY]: 'no es json' })).toEqual(TODAS)
    expect(columnasHistorial({ [HISTORIAL_COLUMNAS_KEY]: '["fecha"]' })).toEqual(TODAS)
    expect(columnasHistorial({ [HISTORIAL_COLUMNAS_KEY]: '{"fee":1}' })).toEqual(TODAS)
  })

  it('una lista vacía es válida y el orden es el canónico', () => {
    expect(columnasHistorial({ [HISTORIAL_COLUMNAS_KEY]: '[]' })).toEqual([])
    expect(columnasHistorial({ [HISTORIAL_COLUMNAS_KEY]: '["wallet","cantidad"]' })).toEqual(['cantidad', 'wallet'])
  })

  it('serializa en orden canónico y sin repetidos', () => {
    expect(serializarColumnasHistorial(['wallet', 'valor', 'valor'])).toBe('["valor","wallet"]')
  })
})
