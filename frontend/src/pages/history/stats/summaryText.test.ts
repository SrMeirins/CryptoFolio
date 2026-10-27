import { describe, expect, it } from 'vitest'
import { marginNotice, netLine, signedMoney } from './summaryText'

// Textos del resumen (#403). Datos sintéticos.
const m = (EUR: number) => ({ EUR, USD: EUR * 2 })

describe('summaryText (#403)', () => {
  it('importe con signo', () => {
    expect(signedMoney(5, 'EUR')).toMatch(/^\+5,00/)
    expect(signedMoney(-5, 'EUR')).toMatch(/^-5,00/)
    expect(signedMoney(0, 'EUR')).toMatch(/^0,00/)
  })

  it('neto en la moneda de visualización; sin recuperado no hay línea', () => {
    expect(netLine({ invested: m(100), recovered: m(25) }, 'EUR')).toMatch(/^Neto 75,00.+tras recuperar 25,00/)
    expect(netLine({ invested: m(100), recovered: m(25) }, 'USD')).toMatch(/^Neto 150,00/)
    expect(netLine({ invested: m(100), recovered: m(0) }, 'EUR')).toBeNull()
  })

  it('aviso del margen en singular y plural; nada sin margen', () => {
    expect(marginNotice({ included: false, ops: 1, sells: 0 })).toBe('Sin margen: 1 operación queda fuera del resumen.')
    expect(marginNotice({ included: true, ops: 2, sells: 1 })).toBe('Incluye 2 operaciones de margen, 1 de ellas venta.')
    expect(marginNotice({ included: false, ops: 0, sells: 0 })).toBeNull()
  })
})
