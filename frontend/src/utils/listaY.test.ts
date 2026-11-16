import { describe, expect, it } from 'vitest'
import { listaY } from './listaY'

describe('listaY (#527)', () => {
  it('une con comas y la última con «y»', () => {
    expect(listaY([])).toBe('')
    expect(listaY(['A'])).toBe('A')
    expect(listaY(['A', 'B'])).toBe('A y B')
    expect(listaY(['A', 'B', 'C'])).toBe('A, B y C')
  })
})
