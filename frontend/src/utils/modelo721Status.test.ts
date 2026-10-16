import { describe, expect, it } from 'vitest'
import { modelo721Status, pendingPricesText } from './modelo721Status'

// Estado del Modelo 721 con precios pendientes (#267).
describe('modelo721Status', () => {
  it('con el mínimo por encima del umbral, obligatorio aunque falten precios', () => {
    expect(modelo721Status({ superaUmbral: true, incompleto: true })).toBe('obligatorio')
    expect(modelo721Status({ superaUmbral: true })).toBe('obligatorio')
  })
  it('por debajo del umbral con precios pendientes, incompleto (nunca «Sin obligación»)', () => {
    expect(modelo721Status({ superaUmbral: false, incompleto: true })).toBe('incompleto')
  })
  it('con todos los precios y por debajo del umbral, sin obligación', () => {
    expect(modelo721Status({ superaUmbral: false, incompleto: false })).toBe('sin-obligacion')
    expect(modelo721Status({ superaUmbral: false })).toBe('sin-obligacion')
  })
})

describe('pendingPricesText', () => {
  it('uno, varios y lista recortada', () => {
    expect(pendingPricesText(['ADA'])).toBe('Falta el precio de ADA')
    expect(pendingPricesText(['ADA', 'DOT'])).toBe('Faltan precios de ADA y DOT')
    expect(pendingPricesText(['ADA', 'DOT', 'XLM'])).toBe('Faltan precios de ADA, DOT y XLM')
    expect(pendingPricesText(['ADA', 'DOT', 'XLM', 'BTC', 'ETH'])).toBe('Faltan precios de ADA, DOT, XLM y 2 más')
  })
  it('sin pendientes, nada', () => {
    expect(pendingPricesText([])).toBeNull()
    expect(pendingPricesText(undefined)).toBeNull()
  })
})
