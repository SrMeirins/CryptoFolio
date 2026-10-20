import { describe, expect, it } from 'vitest'
import { edgeEnabled, filterOptions, nextEnabled, typeAhead, groupStarts } from './dropdownNav'

// Teclado del Dropdown (#240).
const opts = [{ label: 'Enero' }, { label: 'Febrero', disabled: true }, { label: 'Marzo' }, { label: 'Mayo' }, { label: 'Ávila' }]

describe('navegación del Dropdown', () => {
  it('flechas: saltan las deshabilitadas y no dan la vuelta', () => {
    expect(nextEnabled(opts, 0, 1)).toBe(2)
    expect(nextEnabled(opts, 2, -1)).toBe(0)
    expect(nextEnabled(opts, 4, 1)).toBe(4)
    expect(nextEnabled(opts, 0, -1)).toBe(0)
  })
  it('Inicio y Fin: primera y última habilitadas', () => {
    expect(edgeEnabled(opts, 'first')).toBe(0)
    expect(edgeEnabled([{ label: 'a', disabled: true }, { label: 'b' }], 'first')).toBe(1)
    expect(edgeEnabled(opts, 'last')).toBe(4)
    expect(edgeEnabled([{ label: 'a', disabled: true }], 'first')).toBe(-1)
  })
  it('búsqueda por letra: siguiente coincidencia con vuelta, sin tildes ni mayúsculas', () => {
    expect(typeAhead(opts, 'm', 0)).toBe(2)
    expect(typeAhead(opts, 'm', 2)).toBe(3)
    expect(typeAhead(opts, 'm', 3)).toBe(2)
    expect(typeAhead(opts, 'av', 0)).toBe(4)
    expect(typeAhead(opts, 'f', 0)).toBe(0)       // Febrero está deshabilitado
  })
  it('filtro del buscador: contiene el texto, sin tildes', () => {
    expect(filterOptions(opts, 'AYO').map(o => o.label)).toEqual(['Mayo'])
    expect(filterOptions(opts, 'avi').map(o => o.label)).toEqual(['Ávila'])
    expect(filterOptions(opts, '  ')).toHaveLength(5)
  })
})

describe('groupStarts (#321)', () => {
  it('marca el inicio de cada grupo consecutivo y omite las opciones sin grupo', () => {
    expect([...groupStarts([{ group: 'A' }, { group: 'A' }, { group: 'B' }, {}, { group: 'B' }])]).toEqual([0, 2, 4])
    expect(groupStarts([{}, {}]).size).toBe(0)
  })
})
