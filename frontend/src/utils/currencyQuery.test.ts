import { describe, expect, it } from 'vitest'
import { otherCurrency, sameCurrencyPlaceholder } from './currencyQuery'

describe('otherCurrency', () => {
  it('alterna EUR y USD', () => {
    expect(otherCurrency('EUR')).toBe('USD')
    expect(otherCurrency('USD')).toBe('EUR')
  })
})

describe('sameCurrencyPlaceholder', () => {
  const previous = { total: 1 }

  it('mantiene los datos previos de la misma moneda (cambio de periodo sin parpadeo)', () => {
    expect(sameCurrencyPlaceholder('USD')(previous, { queryKey: ['daily-pnl', 'USD', '2026-01-01'] })).toBe(previous)
  })

  it('nunca muestra datos de la otra moneda mientras carga', () => {
    expect(sameCurrencyPlaceholder('USD')(previous, { queryKey: ['daily-pnl', 'EUR', 'all'] })).toBeUndefined()
  })

  it('sin consulta previa no hay placeholder', () => {
    expect(sameCurrencyPlaceholder('EUR')(undefined, undefined)).toBeUndefined()
  })
})
