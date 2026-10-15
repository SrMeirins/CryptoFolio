import { describe, expect, it } from 'vitest'
import { costSecondary, flowSecondary, returnSecondary, todaySecondary } from './summaryCards'

// Línea secundaria de las tarjetas del Dashboard (#210).
const clean = (s: string | null) => s?.replace(/\s/g, ' ') ?? null   // Intl usa espacios duros

describe('línea secundaria de las tarjetas', () => {
  it('Coste: número de activos en cartera, con singular', () => {
    expect(costSecondary(13)).toBe('13 activos en cartera')
    expect(costSecondary(1)).toBe('1 activo en cartera')
  })

  it('P&L no realizado: «Hoy» con signo, redondeado y sin dato mientras no hay base', () => {
    expect(clean(todaySecondary(12.345, 'EUR'))).toBe('Hoy: +12,35 €')
    expect(clean(todaySecondary(-3.2, 'EUR'))).toBe('Hoy: -3,20 €')
    expect(clean(todaySecondary(0.001, 'EUR'))).toBe('Hoy: 0,00 €')
    expect(todaySecondary(null, 'EUR')).toBeNull()
    expect(todaySecondary(5, 'USD')).toContain('$')
  })

  it('Rentabilidad: capital invertido en la moneda de visualización', () => {
    expect(clean(returnSecondary(1234.5, 'EUR'))).toBe('Sobre 1.234,50 € invertidos')
    expect(returnSecondary(1234.5, 'USD')).toContain('$')
  })

  it('EUR neto: depositado y retirado en dos líneas, con signo fijo', () => {
    expect(flowSecondary(1500, 200, 'EUR').map(clean)).toEqual(['+1.500,00 € depositado', '−200,00 € retirado'])
    expect(flowSecondary(1500, -200, 'EUR')[1]).toMatch(/^−200/)
  })
})
