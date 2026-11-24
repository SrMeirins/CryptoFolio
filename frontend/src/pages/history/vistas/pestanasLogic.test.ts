import { describe, expect, it } from 'vitest'
import { pestanaSeleccionada, TODAS, vistaModificada } from './pestanasLogic'

// Pestañas de vistas guardadas (#552).
const ids = ['v1', 'v2']

describe('pestanaSeleccionada', () => {
  it('la vista que coincide manda, venga de donde venga', () => {
    expect(pestanaSeleccionada(ids, 'v2', 'v1')).toBe('v2')
    expect(pestanaSeleccionada(ids, 'v1', TODAS)).toBe('v1')
  })

  it('sin coincidencia, la de origen; si era «Todas» o ya no existe, «Todas»', () => {
    expect(pestanaSeleccionada(ids, null, 'v1')).toBe('v1')
    expect(pestanaSeleccionada(ids, null, TODAS)).toBe(TODAS)
    expect(pestanaSeleccionada(ids, null, 'borrada')).toBe(TODAS)
  })
})

describe('vistaModificada', () => {
  it('solo una vista seleccionada que no coincide', () => {
    expect(vistaModificada('v1', null)).toBe(true)
    expect(vistaModificada('v1', 'v1')).toBe(false)
    expect(vistaModificada(TODAS, null)).toBe(false)
  })
})
