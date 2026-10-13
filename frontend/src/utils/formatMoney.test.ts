import { describe, expect, it } from 'vitest'
import { formatEur, formatEurCompact, formatMoney, formatMoneyCompact, formatPrice } from './format'

// Intl separa con espacio no separable (U+00A0) antes del símbolo; se normaliza para comparar.
const norm = (s: string) => s.replace(/\u00a0/g, ' ')

describe('formatMoney (#176)', () => {
  it('EUR por defecto, con 2 decimales y símbolo €', () => {
    expect(norm(formatMoney(12345.678))).toBe('12.345,68 €')
    expect(norm(formatMoney(-5))).toBe('-5,00 €')
  })

  it('USD con símbolo $ (no "US$")', () => {
    expect(norm(formatMoney(12345.678, 'USD'))).toBe('12.345,68 $')
    expect(norm(formatMoney(-0.5, 'USD'))).toBe('-0,50 $')
  })

  it('formatEur y formatEurCompact se mantienen idénticos a formatMoney en EUR', () => {
    expect(formatEur(1234.5)).toBe(formatMoney(1234.5, 'EUR'))
    expect(formatEurCompact(-203.4)).toBe(formatMoneyCompact(-203.4, 'EUR'))
  })

  it('compacto sin decimales en ambas monedas', () => {
    expect(norm(formatMoneyCompact(-203.4))).toBe('-203 €')
    expect(norm(formatMoneyCompact(-203.6, 'USD'))).toBe('-204 $')
  })
})

describe('formatPrice con moneda', () => {
  it('decimales adaptativos en USD', () => {
    expect(norm(formatPrice(65432.1, 'USD'))).toBe('65.432,10 $')
    expect(norm(formatPrice(0.00007123, 'USD'))).toBe('0,00007123 $')
  })

  it('cero o no finito: 0,00 en la moneda pedida', () => {
    expect(norm(formatPrice(0))).toBe('0,00 €')
    expect(norm(formatPrice(NaN, 'USD'))).toBe('0,00 $')
  })
})
