import { describe, expect, it } from 'vitest'
import { ariaSort, DEFAULT_SORT, exportCsvUrl, groupsByDay, nextSort } from './sorting'

describe('orden del Historial (#349)', () => {
  it('pulsar la columna activa invierte el sentido; otra columna empieza descendente', () => {
    expect(nextSort(DEFAULT_SORT, 'fecha')).toEqual({ key: 'fecha', dir: 'asc' })
    expect(nextSort({ key: 'fecha', dir: 'asc' }, 'valor')).toEqual({ key: 'valor', dir: 'desc' })
  })

  it('aria-sort refleja el estado de cada columna', () => {
    expect(ariaSort(DEFAULT_SORT, 'fecha')).toBe('descending')
    expect(ariaSort({ key: 'tipo', dir: 'asc' }, 'tipo')).toBe('ascending')
    expect(ariaSort(DEFAULT_SORT, 'valor')).toBe('none')
  })

  it('solo se agrupa por día al ordenar por fecha', () => {
    expect(groupsByDay(DEFAULT_SORT)).toBe(true)
    expect(groupsByDay({ key: 'valor', dir: 'desc' })).toBe(false)
  })

  it('la URL del CSV lleva filtros y orden, sin paginación ni moneda, y codificada', () => {
    const url = exportCsvUrl({ limit: '50', offset: '100', currency: 'USD', asset: 'XRP', search: 'a&b=c', sort: 'valor', dir: 'asc', type: '' })
    expect(url).toBe('/api/transactions/export.csv?asset=XRP&search=a%26b%3Dc&sort=valor&dir=asc')
    expect(exportCsvUrl({ limit: '50' })).toBe('/api/transactions/export.csv')
  })
})

describe('URL del CSV con rango de importe (#366)', () => {
  it('conserva la moneda solo si hay rango', () => {
    expect(exportCsvUrl({ value_min: '10', currency: 'EUR', limit: '50' })).toBe('/api/transactions/export.csv?value_min=10&currency=EUR')
    expect(exportCsvUrl({ type: 'BUY', currency: 'USD' })).toBe('/api/transactions/export.csv?type=BUY')
  })
})
