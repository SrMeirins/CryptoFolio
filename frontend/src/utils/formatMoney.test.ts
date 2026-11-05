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

// Importes diminutos y cero con signo (#489). Datos sintéticos.
import { formatMoneyPrecise, setAmountsHidden } from './format'

describe('sin «-0,00» y con «< 0,01» (#489)', () => {
  it('cero y menos cero: «0,00», nunca con signo', () => {
    // -1e-12: ruido de coma flotante de una suma, no un importe.
    for (const v of [0, -0, -1e-12]) expect(norm(formatMoney(v))).toBe('0,00 €')
    expect(norm(formatMoney(-0, 'USD'))).toBe('0,00 $')
  })
  it('distinto de cero que redondea a cero: «< 0,01» o «-< 0,01» con el signo delante', () => {
    expect(norm(formatMoney(0.004))).toBe('< 0,01 €')
    expect(norm(formatMoney(-0.004))).toBe('-< 0,01 €')
    expect(norm(formatMoney(0.004, 'USD'))).toBe('< 0,01 $')
    expect(norm(formatMoney(-0.004, 'USD'))).toBe('-< 0,01 $')
  })
  it('lo que ya se ve con dos decimales no cambia', () => {
    expect(norm(formatMoney(0.005))).toBe('0,01 €')
    expect(norm(formatMoney(-0.005))).toBe('-0,01 €')
    expect(norm(formatMoney(1234.5))).toBe('1.234,50 €')
    expect(norm(formatMoney(-1234.5, 'USD'))).toBe('-1.234,50 $')
  })
  it('compacto: «0 €», «< 1 €» y «-< 1 €»', () => {
    expect(norm(formatMoneyCompact(-0.2))).toBe('-< 1 €')
    expect(norm(formatMoneyCompact(0.2))).toBe('< 1 €')
    expect(norm(formatMoneyCompact(-0))).toBe('0 €')
    expect(norm(formatEurCompact(-203.4))).toBe('-203 €')
  })
  it('porcentajes y números sin «-0»', () => {
    expect(formatPercent(-0.001)).toBe('-< 0,01%')
    expect(formatPercent(0.001, 2, true)).toBe('+< 0,01%')
    expect(formatPercent(-0)).toBe('0,00%')
    expect(formatPct(-0.001)).toBe('-< 0,01%')
    expect(formatPct(-0)).toBe('+0,00%')
    expect(formatNumber(-0.0001, 2)).toBe('0')
  })
  it('versión precisa para trazabilidad: dos cifras significativas bajo 0,01', () => {
    expect(norm(formatMoneyPrecise(0.004))).toBe('0,004 €')
    expect(norm(formatMoneyPrecise(-0.0042))).toBe('-0,0042 €')
    expect(norm(formatMoneyPrecise(12.5))).toBe('12,50 €')
  })
  it('la privacidad manda: con importes ocultos, la máscara, nunca «< 0,01»', () => {
    setAmountsHidden(true)
    try {
      expect(formatMoney(0.004)).not.toContain('<')
      expect(formatMoneyPrecise(0.004)).not.toContain('0,004')
    } finally { setAmountsHidden(false) }
  })
})
