import { describe, expect, it } from 'vitest'
import { activeView, stateFromView, viewFiltersFromState } from './savedViewsLogic'
import { EMPTY_FILTERS } from './urlState'
import { DEFAULT_SORT } from './sorting'

const filters = { ...EMPTY_FILTERS, types: ['SELL', 'BUY'], assets: ['XRP'], date_from: '2025-01-01', value_min: '10', manualOnly: true }
const sort = { key: 'valor' as const, dir: 'asc' as const }

describe('vistas guardadas (#369)', () => {
  it('ida y vuelta: estado → filtros de la vista → estado', () => {
    const filtros = viewFiltersFromState(filters, sort)
    expect(filtros).not.toHaveProperty('limit')
    expect(filtros).not.toHaveProperty('currency')
    expect(stateFromView(filtros)).toEqual({ filters, sort })
  })

  it('detecta la vista activa aunque cambie el orden de las listas', () => {
    const v = { id: 'a', nombre: 'Mi vista', predeterminada: false, filtros: viewFiltersFromState(filters, sort) }
    const reordered = { ...filters, types: ['BUY', 'SELL'] }
    expect(activeView([v], reordered, sort)?.id).toBe('a')
    expect(activeView([v], { ...filters, value_min: '11' }, sort)).toBeNull()
    expect(activeView([v], filters, DEFAULT_SORT)).toBeNull()
  })

  it('una vista sin orden equivale al orden por defecto', () => {
    const v = { id: 'b', nombre: 'Todo', predeterminada: false, filtros: {} }
    expect(activeView([v], EMPTY_FILTERS, DEFAULT_SORT)?.id).toBe('b')
  })
})

describe('vistas y comisiones agrupadas (#371)', () => {
  it('la vista guarda el conmutador desactivado y lo restaura', () => {
    const off = { ...EMPTY_FILTERS, groupFees: false }
    const filtros = viewFiltersFromState(off, DEFAULT_SORT)
    expect(filtros.group_fees).toBe('false')
    expect(stateFromView(filtros).filters.groupFees).toBe(false)
    expect(stateFromView({}).filters.groupFees).toBe(true)
  })
})
