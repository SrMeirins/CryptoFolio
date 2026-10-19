import { describe, expect, it } from 'vitest'
import { paginate } from './pagination'

// Paginación (#299).
describe('paginate', () => {
  const xs = Array.from({ length: 62 }, (_, i) => i + 1)
  it('páginas, rango «1–25 de 62» y última parcial', () => {
    expect(paginate(xs, 1, 25)).toMatchObject({ page: 1, pages: 3, from: 1, to: 25, total: 62 })
    const last = paginate(xs, 3, 25)
    expect(last).toMatchObject({ from: 51, to: 62 })
    expect(last.items).toHaveLength(12)
  })
  it('recorta la página si el total encoge o es inválida', () => {
    expect(paginate(xs, 9, 25).page).toBe(3)
    expect(paginate(xs, 0, 25).page).toBe(1)
    expect(paginate(xs, Number.NaN, 25).page).toBe(1)
  })
  it('sin elementos', () => {
    expect(paginate([], 1, 25)).toMatchObject({ items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 })
  })
})
