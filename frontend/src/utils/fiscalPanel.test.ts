import { describe, expect, it } from 'vitest'
import { deadlineFromHito, deadlineUrgency, estimatedTax, gainLossShares } from './fiscalPanel'
import type { FiscalHito } from '../api/portfolio'
import { calcularTramos } from './tramosIrpf'

// Panel fiscal del Dashboard (#236).
const hito = (p: Partial<FiscalHito>): FiscalHito => ({
  id: 'renta', ejercicio: 2025, titulo: 'Renta de 2025', desde: '2026-04-08', hasta: '2026-06-30', inicioAproximado: true,
  estado: 'en-curso', diasRestantes: 60, diasParaAbrir: 0, progreso: 25, ...p,
})

describe('deadlineFromHito', () => {
  it('adapta el hito del calendario del backend', () => {
    expect(deadlineFromHito(hito({}))).toEqual({ label: 'Renta de 2025', opens: '2026-04-08', opensApprox: true, date: '2026-06-30', days: 60, status: 'open', daysToOpen: 0, progress: 25 })
    expect(deadlineFromHito(hito({ estado: 'proximo', diasParaAbrir: 7, progreso: 0 }))).toMatchObject({ status: 'pending', daysToOpen: 7 })
  })
})

describe('deadlineUrgency', () => {
  it('tranquilo, pronto y urgente según los días al cierre', () => {
    expect(deadlineUrgency(deadlineFromHito(hito({ diasRestantes: 60 })))).toBe('calm')
    expect(deadlineUrgency(deadlineFromHito(hito({ diasRestantes: 20 })))).toBe('soon')
    expect(deadlineUrgency(deadlineFromHito(hito({ diasRestantes: 5 })))).toBe('urgent')
    expect(deadlineUrgency(deadlineFromHito(hito({ estado: 'proximo', diasRestantes: 5 })))).toBe('calm')
  })
})

describe('estimatedTax', () => {
  it('suma la cuota de los tramos del ahorro; sin base positiva, 0', () => {
    const base = 10_000
    expect(estimatedTax(base)).toBeCloseTo(calcularTramos(base).reduce((s, t) => s + t.cuota, 0), 2)
    expect(estimatedTax(0)).toBe(0)
    expect(estimatedTax(-500)).toBe(0)
  })
})

describe('gainLossShares', () => {
  it('reparte en % el valor absoluto de ganancias y pérdidas', () => {
    expect(gainLossShares(30, -10)).toEqual({ gains: 75, losses: 25 })
    expect(gainLossShares(0, 0)).toEqual({ gains: 0, losses: 0 })
  })
})
