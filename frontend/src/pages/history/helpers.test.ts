import { describe, expect, it } from 'vitest'
import { toDisplayAmount } from './helpers'

describe('toDisplayAmount (#177)', () => {
  it('EUR: el importe tal cual', () => {
    expect(toDisplayAmount(100, { usd_per_eur: 1.2 }, 'EUR')).toBe(100)
  })

  it('USD: con el tipo de la fecha de la operación (número o texto de la API)', () => {
    expect(toDisplayAmount(100, { usd_per_eur: 1.2 }, 'USD')).toBeCloseTo(120, 10)
    expect(toDisplayAmount(100, { usd_per_eur: '1.1' }, 'USD')).toBeCloseTo(110, 10)
  })

  it('USD sin tipo válido: null, nunca euros mostrados como dólares', () => {
    for (const usd_per_eur of [null, undefined, 0, 'abc']) {
      expect(toDisplayAmount(100, { usd_per_eur }, 'USD')).toBeNull()
    }
  })

  it('sin importe: null en ambas monedas', () => {
    expect(toDisplayAmount(null, { usd_per_eur: 1.2 }, 'USD')).toBeNull()
    expect(toDisplayAmount(null, { usd_per_eur: 1.2 }, 'EUR')).toBeNull()
  })
})
