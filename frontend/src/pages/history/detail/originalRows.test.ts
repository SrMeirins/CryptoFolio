import { describe, expect, it } from 'vitest'
import { usedColumns } from './originalRows'

// Columnas con algún valor (#374): las vacías en todas las filas se ocultan.
describe('usedColumns (#374)', () => {
  it('quita las columnas vacías o con solo espacios en todas las filas', () => {
    expect(usedColumns({ columns: ['a', 'b', 'c'], rows: [['1', '', ' '], ['2', 'x', '']] })).toEqual([0, 1])
  })

  it('sin filas no hay columnas', () => {
    expect(usedColumns({ columns: ['a'], rows: [] })).toEqual([])
  })
})
