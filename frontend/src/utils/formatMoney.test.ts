import { describe, expect, it } from 'vitest'
import { formatAmount, formatEur, formatEurCompact, formatMoney, formatMoneyCompact, formatNumber, formatPct, formatPercent, formatPrice } from './format'

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

describe('separador de miles y coma decimal en toda la app (#210)', () => {
  it('los importes de cuatro cifras también se agrupan, igual que los de cinco', () => {
    expect(norm(formatMoney(8981.02))).toBe('8.981,02 €')
    expect(norm(formatMoney(10931.61))).toBe('10.931,61 €')
    expect(norm(formatMoneyCompact(-1950, 'USD'))).toBe('-1.950 $')
    expect(norm(formatMoney(999.5))).toBe('999,50 €')
  })
  it('números y cantidades con el mismo criterio', () => {
    expect(formatNumber(1234.5)).toBe('1.234,5')
    expect(formatNumber(1234.5678, 0)).toBe('1.235')
    expect(formatNumber(0.5, 2, 2)).toBe('0,50')
    expect(formatAmount(2500)).toBe('2.500')
  })
  it('porcentajes con coma decimal y signo opcional', () => {
    expect(formatPercent(-17.844)).toBe('-17,84%')
    expect(formatPercent(5.5, 1, true)).toBe('+5,5%')
    expect(formatPercent(0, 2, true)).toBe('0,00%')
    expect(formatPct(3.2)).toBe('+3,20%')
  })
})

describe('precios muy pequeños (#337)', () => {
  it('con cifras significativas, sin notación científica', async () => {
    const { formatPrice, formatSignificant } = await import('./format')
    const sinDuro = (t: string) => t.replace(/\u00a0/g, ' ')
    expect(sinDuro(formatPrice(0.0000094963))).toBe('0,0000094963 €')
    expect(sinDuro(formatPrice(0.00000024))).toBe('0,00000024 €')
    expect(sinDuro(formatPrice(0.074206))).toBe('0,074206 €')
    expect(formatSignificant(0.0000094963)).toBe('0,0000094963')
  })
})
