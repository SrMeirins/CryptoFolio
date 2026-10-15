import { describe, expect, it } from 'vitest'
import { estimatedTax, gainLossShares, nextFiscalDeadline } from './fiscalPanel'
import { calcularTramos } from './tramosIrpf'

// Panel fiscal del Dashboard (#236).
describe('nextFiscalDeadline', () => {
  it('antes del 30 de junio: el plazo de la renta del año anterior', () => {
    expect(nextFiscalDeadline('2026-05-01', false)).toEqual({ label: 'Renta 2025', date: '2026-06-30', days: 60 })
  })
  it('después: el 721 del año siguiente si hay obligación; si no, la renta del año en curso', () => {
    expect(nextFiscalDeadline('2026-10-15', true)).toEqual({ label: 'Modelo 721 de 2026', date: '2027-03-31', days: 167 })
    expect(nextFiscalDeadline('2026-10-15', false)).toEqual({ label: 'Renta 2026', date: '2027-06-30', days: 258 })
  })
  it('el propio día del plazo cuenta como 0 días', () => {
    expect(nextFiscalDeadline('2026-06-30', false).days).toBe(0)
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
