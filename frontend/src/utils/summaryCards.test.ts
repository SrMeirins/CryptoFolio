import { describe, expect, it } from 'vitest'
import { costSecondary, returnSecondary } from './summaryCards'

// Datos de la ayuda de las tarjetas del Dashboard (#210, #412).
const clean = (s: string | null) => s?.replace(/\s/g, ' ') ?? null   // Intl usa espacios duros

describe('ayuda de las tarjetas', () => {
  it('Coste: número de activos en cartera, con singular', () => {
    expect(costSecondary(13)).toBe('13 activos en cartera')
    expect(costSecondary(1)).toBe('1 activo en cartera')
  })

  it('Rentabilidad: capital invertido en la moneda de visualización', () => {
    expect(clean(returnSecondary(1234.5, 'EUR'))).toBe('Sobre 1.234,50 € invertidos')
    expect(returnSecondary(1234.5, 'USD')).toContain('$')
  })
})
