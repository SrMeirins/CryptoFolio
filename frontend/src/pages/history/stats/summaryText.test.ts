import { describe, expect, it } from 'vitest'
import { chipTarjeta, marginNotice, netLine, opsTarjeta, signedMoney } from './summaryText'

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

describe('chip de las tarjetas (#553)', () => {
  const totals = { fiat_buys: 12, withdrawn_ops: 1, sells: 0, income_ops: 1500, fee_ops: 7 }
  it('cada tarjeta cuenta sus operaciones, las mismas que su filtro', () => {
    expect(opsTarjeta('invertido', totals)).toBe(12)
    expect(opsTarjeta('retirado', totals)).toBe(1)
    expect(opsTarjeta('ventas', totals)).toBe(0)
    expect(opsTarjeta('ingresos', totals)).toBe(1500)
    expect(opsTarjeta('comisiones', totals)).toBe(7)
  })
  it('texto con número y nombre; sin operaciones, ninguna o ninguno', () => {
    expect(chipTarjeta('invertido', 12)).toBe('12 compras')
    expect(chipTarjeta('retirado', 1)).toBe('1 retirada')
    expect(chipTarjeta('ventas', 0)).toBe('Ninguna')
    expect(chipTarjeta('ingresos', 0)).toBe('Ninguno')
    expect(chipTarjeta('ingresos', 1500)).toBe('1.500 ingresos')
    expect(chipTarjeta('comisiones', 1)).toBe('1 comisión')
  })
})

