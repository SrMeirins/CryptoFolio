import { describe, expect, it } from 'vitest'
import { detailNeighbors, fiscalLink, importHistoryLink, portfolioLink } from './detailLinks'

describe('enlaces del panel de detalle (#373)', () => {
  it('Fiscal abre el año en la vista de operaciones', () => {
    expect(fiscalLink(2025)).toBe('/fiscal?anio=2025&vista=operaciones')
  })

  it('codifica el activo y el id de importación en la URL', () => {
    expect(portfolioLink('A&B')).toBe('/portfolio?activo=A%26B')
    expect(importHistoryLink('x/../y')).toBe('/history?importacion=x%2F..%2Fy')
  })
})

describe('detailNeighbors (#373)', () => {
  const ids = ['a', 'b', 'c']

  it('en medio de la página, vecinos por id', () => {
    expect(detailNeighbors(ids, 'b', { offset: 0, pageSize: 3, total: 3 })).toEqual({ prev: { id: 'a' }, next: { id: 'c' } })
  })

  it('en los bordes de una página intermedia, pasa de página', () => {
    const page = { offset: 3, pageSize: 3, total: 9 }
    expect(detailNeighbors(ids, 'a', page).prev).toEqual({ page: 'prev' })
    expect(detailNeighbors(ids, 'c', page).next).toEqual({ page: 'next' })
  })

  it('al principio y al final de la lista no hay más', () => {
    expect(detailNeighbors(ids, 'a', { offset: 0, pageSize: 3, total: 3 }).prev).toBeNull()
    expect(detailNeighbors(ids, 'c', { offset: 0, pageSize: 3, total: 3 }).next).toBeNull()
  })

  it('una transacción fuera de la página (operación relacionada) no tiene vecinos', () => {
    expect(detailNeighbors(ids, 'z', { offset: 0, pageSize: 3, total: 9 })).toEqual({ prev: null, next: null })
  })
})
