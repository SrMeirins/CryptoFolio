import { afterEach, describe, expect, it } from 'vitest'
import {
  HIDDEN_AMOUNT, amountsAreHidden, formatAmount, formatEur, formatMoney, formatMoneyCompact, formatPercent, formatPrice, setAmountsHidden,
} from './format'
import { usePrivacyStore } from '../store/privacyStore'

// Modo privacidad (#254).
afterEach(() => setAmountsHidden(false))

describe('formateo con el modo privacidad', () => {
  it('importes y cantidades se sustituyen por «••••» con su moneda', () => {
    setAmountsHidden(true)
    expect(formatMoney(1234.56, 'EUR')).toBe(`${HIDDEN_AMOUNT} €`)
    expect(formatMoney(-10, 'USD')).toBe(`${HIDDEN_AMOUNT} $`)
    expect(formatMoneyCompact(9876, 'EUR')).toBe(`${HIDDEN_AMOUNT} €`)
    expect(formatEur(5)).toBe(`${HIDDEN_AMOUNT} €`)
    expect(formatAmount('0.5')).toBe(HIDDEN_AMOUNT)
  })

  it('la cifra real no aparece en el texto (ni para lectores de pantalla)', () => {
    setAmountsHidden(true)
    expect(formatMoney(1234.56, 'EUR')).not.toMatch(/\d/)
    expect(formatAmount(12.3456)).not.toMatch(/\d/)
  })

  it('precios de mercado, porcentajes y valores ausentes siguen igual', () => {
    setAmountsHidden(true)
    expect(formatPrice(65432.1, 'EUR')).toMatch(/65\.432,10/)
    expect(formatPercent(-12.5, 1)).toBe('-12,5%')
    expect(formatAmount(null)).toBe('—')
  })

  it('desactivado, el formato habitual', () => {
    expect(formatMoney(1234.56, 'EUR').replace(/\s/g, ' ')).toBe('1.234,56 €')
    expect(formatAmount(0.5)).toBe('0,5')
  })
})

describe('usePrivacyStore', () => {
  it('alterna el modo y lo aplica al formateo (sin almacenamiento disponible, solo en la sesión)', () => {
    const start = usePrivacyStore.getState().hidden
    usePrivacyStore.getState().toggle()
    expect(usePrivacyStore.getState().hidden).toBe(!start)
    expect(amountsAreHidden()).toBe(!start)
    usePrivacyStore.getState().toggle()
    expect(amountsAreHidden()).toBe(start)
  })
})
