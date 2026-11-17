import { describe, expect, it } from 'vitest'
import { costChip, costSecondary, pnlPctChip, returnSecondary, todayPctChip, withdrawnChip } from './summaryCards'

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

describe('chips de las tarjetas KPI (#507)', () => {
  it('coste, P&L, hoy y retirado', () => {
    expect(costChip(1)).toBe('1 activo')
    expect(costChip(12)).toBe('12 activos')
    expect(pnlPctChip(12.345).tone).toBe('positive')
    expect(pnlPctChip(12.345).text).toMatch(/^\+12,35\s?%$/)
    expect(pnlPctChip(-0.001).tone).toBe('neutral')
    expect(todayPctChip(-0.8)).toMatchObject({ tone: 'negative' })
    expect(todayPctChip(-0.8)!.text).toMatch(/^-0,80\s?%$/)
    expect(todayPctChip(-0.8)!.aria).toMatch(/^Hoy: -0,80\s?%$/)
    expect(todayPctChip(null)).toBeNull()
    expect(withdrawnChip(1200, 'EUR')).toMatch(/^Retirado 1\.200,00\s€$/)
  })
})
