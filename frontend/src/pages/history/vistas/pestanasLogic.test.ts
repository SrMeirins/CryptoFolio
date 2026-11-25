import { describe, expect, it } from 'vitest'
import { pestanaSeleccionada, TODAS, vistaModificada } from './pestanasLogic'

// Pestañas de vistas guardadas (#552).
const ids = ['v1', 'v2']

describe('pestanaSeleccionada', () => {
  it('desde «Todas» con filtros, la primera vista que coincide; si ninguna, «Todas»', () => {
    expect(pestanaSeleccionada(ids, ['v1'], TODAS, true)).toBe('v1')
    expect(pestanaSeleccionada(ids, [], TODAS, true)).toBe(TODAS)
  })

  it('la vista de origen se respeta: coincide o queda modificada, sin saltar a otra', () => {
    expect(pestanaSeleccionada(ids, ['v1', 'v2'], 'v2', true)).toBe('v2')
    expect(pestanaSeleccionada(ids, ['v2'], 'v1', false)).toBe('v1')
    expect(pestanaSeleccionada(ids, [], 'v1', true)).toBe('v1')
  })

  it('«Todas» sin filtros se queda aunque una vista guarde lo mismo (solo el orden)', () => {
    expect(pestanaSeleccionada(ids, ['v1'], TODAS, false)).toBe(TODAS)
    expect(pestanaSeleccionada(ids, ['v1'], 'v1', false)).toBe('v1')
  })

  it('si la vista de origen ya no existe, la que coincida o «Todas»', () => {
    expect(pestanaSeleccionada(ids, [], 'borrada', true)).toBe(TODAS)
    expect(pestanaSeleccionada(ids, ['v2'], 'borrada', true)).toBe('v2')
  })
})

describe('vistaModificada', () => {
  it('solo una vista seleccionada que no coincide', () => {
    expect(vistaModificada('v1', [])).toBe(true)
    expect(vistaModificada('v1', ['v1'])).toBe(false)
    expect(vistaModificada(TODAS, [])).toBe(false)
  })
})
